#!/usr/bin/env python3
"""
twitch_drops.py - farm Twitch Drops automatically by WATCHING streams.

The script opens a muted 160p stream of the game you choose in a Chromium
window controlled by Playwright. About every 2 minutes it checks that the
channel is still live and still playing that game, and switches channel when
it isn't. Every 15 minutes it opens your drops inventory and claims whatever
is ready.

Your password is never stored. You log in once by hand and the session is kept
in the browser profile folder "twitch_profile" next to this script. Treat that
folder like a password: anyone who has a copy of it is logged in as you.

Install (Windows, Python 3.10 or newer):

    py -m pip install playwright
    py -m playwright install chromium

Usage:

    1. Log in once. A browser window opens: log in (including 2FA), then come
       back to the terminal and press Enter.

           py twitch_drops.py --login

    2. Farm drops for a game:

           py twitch_drops.py --game "Rust"

       Prefer some channels. The first one that is live AND playing the game is
       watched, otherwise the most-watched drops-enabled stream:

           py twitch_drops.py --game "Rust" --channels streamer1,streamer2

       Run without a visible browser window:

           py twitch_drops.py --game "Rust" --headless

    3. Stop with Ctrl+C.

Selectors, URLs and intervals are constants at the top of the file, so they are
easy to adjust when Twitch changes its site.

Note: automated watching may break Twitch's terms of service or the rules of a
game publisher's drop campaign, and drops (or the account) can be revoked. Use
it at your own risk.
"""

import argparse
import asyncio
import json
import random
import re
import sys
import threading
import unicodedata
from datetime import datetime
from pathlib import Path
from typing import NamedTuple
from urllib.parse import quote, urlparse

from playwright.async_api import (
    BrowserContext,
    Error as PlaywrightError,
    Page,
    Playwright,
    TimeoutError as PlaywrightTimeoutError,
    async_playwright,
)

# --------------------------------------------------------------------------- #
# Settings
# --------------------------------------------------------------------------- #

# Paths
SCRIPT_DIR = Path(__file__).resolve().parent
PROFILE_DIR = SCRIPT_DIR / "twitch_profile"

# URLs and API
TWITCH_URL = "https://www.twitch.tv"
LOGIN_URL = TWITCH_URL + "/login"
DIRECTORY_URL = TWITCH_URL + "/directory/category/{slug}?filter=drops&sort=VIEWER_COUNT"
INVENTORY_URL = TWITCH_URL + "/drops/inventory"
GQL_URL = "https://gql.twitch.tv/gql"
GQL_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko"

# Selectors
SEL_USER_MENU = 'button[data-a-target="user-menu-toggle"]'
SEL_STREAM_CARD = 'a[data-a-target="preview-card-image-link"]'
SEL_MATURE_GATE = (
    'button[data-a-target="content-classification-gate-overlay-start-watching-button"], '
    'button[data-a-target="player-overlay-mature-accept"]'
)
CLAIM_BUTTON_NAME = re.compile(r"(claim|hämta|lös in)", re.IGNORECASE)
CHANNEL_NAME = re.compile(r"[A-Za-z0-9_]{1,25}")

# Intervals and waits, in seconds
LIVE_CHECK_INTERVAL = 120  # how often the watched channel is checked
LIVE_CHECK_JITTER = 20  # +/- random seconds added to every live check
NO_STREAMS_WAIT = 5 * 60  # wait when no drops stream is live, then clear skip list
CLAIM_INTERVAL = 15 * 60  # how often the inventory is opened to claim drops
FIRST_CLAIM_DELAY = 60  # first inventory check, shortly after start-up
INVENTORY_LOAD_WAIT = 8  # time the inventory page gets to render
STREAM_SETTLE_WAIT = 6  # time a channel page gets before its player is checked
AFTER_CLAIM_WAIT = 2  # pause between two claim clicks
ERROR_RETRY_DELAY = 30  # pause after a browser error before trying again

# Timeouts, in milliseconds
NAV_TIMEOUT_MS = 45_000
GQL_TIMEOUT_MS = 15_000
ELEMENT_TIMEOUT_MS = 15_000
CLICK_TIMEOUT_MS = 5_000

# Browser
CHROMIUM_ARGS = ["--mute-audio", "--autoplay-policy=no-user-gesture-required"]
VIEWPORT = {"width": 1280, "height": 720}
# Runs before Twitch's own scripts on every page: lowest quality, muted player.
INIT_SCRIPT = """
(() => {
  if (!location.hostname.endsWith("twitch.tv")) return;
  try {
    localStorage.setItem("video-quality", JSON.stringify({ default: "160p30" }));
    localStorage.setItem("video-muted", JSON.stringify({ default: true }));
  } catch (e) {}
})();
"""
# Resumes the player if it is paused; tells the caller what it found.
ENSURE_PLAYING_JS = """
() => {
  const video = document.querySelector("video");
  if (!video) return "no-video";
  if (video.paused) {
    video.muted = true;
    video.play().catch(() => {});
    return "resumed";
  }
  return "playing";
}
"""


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def timestamp() -> str:
    return datetime.now().strftime("%H:%M:%S")


def log(message: str) -> None:
    print(f"[{timestamp()}] {message}", flush=True)


def short(exc: BaseException) -> str:
    """First line of an exception message (Playwright adds long call logs)."""
    lines = str(exc).strip().splitlines()
    return lines[0] if lines else type(exc).__name__


def jittered(base: float, jitter: float) -> float:
    return max(1.0, base + random.uniform(-jitter, jitter))


def slugify(name: str) -> str:
    """Twitch category slug: "Tom Clancy's Rainbow Six Siege" -> "tom-clancys-rainbow-six-siege"."""
    text = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    text = text.lower().replace("'", "")
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def same_game(a: str | None, b: str | None) -> bool:
    return bool(a and b) and slugify(a) == slugify(b)


def channel_from_href(href: str | None) -> str | None:
    """'/somechannel', 'https://www.twitch.tv/somechannel' or 'SomeChannel' -> 'somechannel'."""
    path = urlparse((href or "").strip()).path.strip("/")
    return path.lower() if CHANNEL_NAME.fullmatch(path) else None


def parse_channels(value: str) -> list[str]:
    channels: list[str] = []
    for item in value.split(","):
        if not item.strip():
            continue
        login = channel_from_href(item)
        if login is None:
            raise argparse.ArgumentTypeError(f"not a Twitch channel name: {item.strip()!r}")
        if login not in channels:
            channels.append(login)
    return channels


async def ainput(prompt: str = "") -> str:
    """input() that keeps the event loop running and doesn't block Ctrl+C."""
    loop = asyncio.get_running_loop()
    future: asyncio.Future[str] = loop.create_future()

    def deliver(setter, value) -> None:
        if not future.done():
            setter(value)

    def reader() -> None:
        try:
            line = input(prompt)
        except BaseException as exc:  # EOFError when stdin is closed
            setter, value = future.set_exception, exc
        else:
            setter, value = future.set_result, line
        try:
            loop.call_soon_threadsafe(deliver, setter, value)
        except RuntimeError:  # the event loop is already gone
            pass

    # A daemon thread, so a pending input() never keeps the script alive.
    threading.Thread(target=reader, daemon=True).start()
    return await future


# --------------------------------------------------------------------------- #
# Browser
# --------------------------------------------------------------------------- #


async def launch(pw: Playwright, headless: bool) -> BrowserContext:
    PROFILE_DIR.mkdir(exist_ok=True)
    context = await pw.chromium.launch_persistent_context(
        str(PROFILE_DIR),
        headless=headless,
        args=CHROMIUM_ARGS,
        viewport=VIEWPORT,
    )
    context.set_default_timeout(ELEMENT_TIMEOUT_MS)
    context.set_default_navigation_timeout(NAV_TIMEOUT_MS)
    await context.add_init_script(INIT_SCRIPT)
    return context


async def close_quietly(context: BrowserContext) -> None:
    try:
        await asyncio.wait_for(context.close(), timeout=10)
    except BaseException:  # already closed, or the driver went away on Ctrl+C
        pass


async def first_page(context: BrowserContext) -> Page:
    return context.pages[0] if context.pages else await context.new_page()


async def is_logged_in(page: Page) -> bool:
    await page.goto(TWITCH_URL, wait_until="domcontentloaded")
    try:
        await page.locator(SEL_USER_MENU).first.wait_for(state="visible")
        return True
    except PlaywrightTimeoutError:
        return False


async def do_login(pw: Playwright) -> bool:
    context = await launch(pw, headless=False)
    try:
        page = await first_page(context)
        await page.goto(LOGIN_URL, wait_until="domcontentloaded")
        log("Log in to Twitch in the browser window (including 2FA).")
        try:
            await ainput(f"[{timestamp()}] Press Enter here when you are logged in... ")
        except EOFError:
            log("No input available - login aborted.")
            return False
        if await is_logged_in(page):
            log(f"Logged in. The session is saved in {PROFILE_DIR}")
            return True
        log("Could not find the user menu, so you are not logged in. Run --login again.")
        return False
    finally:
        await close_quietly(context)


# --------------------------------------------------------------------------- #
# Farming
# --------------------------------------------------------------------------- #


class StreamStatus(NamedTuple):
    live: bool
    game: str | None


class DropFarmer:
    def __init__(self, context: BrowserContext, game: str, preferred: list[str]) -> None:
        self.context = context
        self.game = game
        self.slug = slugify(game)
        self.preferred = preferred
        # Channels that went offline or changed game. Only used to filter the
        # drops directory: preferred channels are always re-checked live, so a
        # favourite that restarts its stream is picked up again.
        self.skip: set[str] = set()
        self.current: str | None = None
        self.page: Page | None = None

    # ----- Twitch GQL --------------------------------------------------------

    async def gql(self, query: str) -> dict | None:
        """POST a query to Twitch GQL. None means the request failed."""
        try:
            response = await self.context.request.post(
                GQL_URL,
                headers={"Client-Id": GQL_CLIENT_ID},
                data={"query": query},
                timeout=GQL_TIMEOUT_MS,
            )
            if not response.ok:
                log(f"GQL request failed: HTTP {response.status}")
                return None
            body = await response.json()
        except Exception as exc:  # network error or invalid JSON
            log(f"GQL request failed: {short(exc)}")
            return None
        if not isinstance(body, dict):
            log("GQL request failed: unexpected response")
            return None
        if body.get("errors"):
            log(f"GQL error: {body['errors'][0].get('message', body['errors'][0])}")
            return None
        return body.get("data") or {}

    async def stream_status(self, login: str) -> StreamStatus | None:
        """Is `login` live, and with which game? None means the check failed."""
        query = "{ user(login:%s) { stream { id game { name } } } }" % json.dumps(login)
        data = await self.gql(query)
        if data is None:
            return None
        stream = (data.get("user") or {}).get("stream")
        if not stream:
            return StreamStatus(False, None)
        return StreamStatus(True, (stream.get("game") or {}).get("name"))

    async def resolve_game(self) -> None:
        """Use Twitch's own name and slug for the game when GQL knows them."""
        data = await self.gql("{ game(name:%s) { name slug } }" % json.dumps(self.game))
        game = (data or {}).get("game")
        if game and game.get("slug"):
            self.game = game.get("name") or self.game
            self.slug = game["slug"]
            log(f"Game: {self.game} (category '{self.slug}')")
        elif data is not None and "game" in data:
            log(f"Twitch has no category called '{self.game}'. Trying '{self.slug}' anyway.")
        else:
            log(f"Could not look up '{self.game}'. Using category '{self.slug}'.")

    # ----- Choosing a channel -----------------------------------------------

    async def first_live_preferred(self, candidates: list[str]) -> str | None:
        for login in candidates:
            status = await self.stream_status(login)
            if status and status.live and same_game(status.game, self.game):
                return login
        return None

    async def directory_channels(self) -> list[str]:
        """Channel names from the drops directory, most viewers first."""
        page = await self.watch_page()
        await page.goto(DIRECTORY_URL.format(slug=quote(self.slug)), wait_until="domcontentloaded")
        cards = page.locator(SEL_STREAM_CARD)
        try:
            await cards.first.wait_for(state="attached")
        except PlaywrightTimeoutError:
            return []
        hrefs = await cards.evaluate_all("cards => cards.map(card => card.getAttribute('href'))")
        channels: list[str] = []
        for href in hrefs:
            login = channel_from_href(href)
            if login and login not in channels:
                channels.append(login)
        return channels

    async def find_channel(self) -> str | None:
        login = await self.first_live_preferred(self.preferred)
        if login:
            log(f"Preferred channel {login} is live with {self.game}.")
            return login
        if self.preferred:
            log(f"No preferred channel is live with {self.game}; checking the drops directory.")
        for login in await self.directory_channels():
            if login not in self.skip:
                log(f"Picked {login} from the drops directory.")
                return login
        return None

    # ----- Watching ----------------------------------------------------------

    async def watch_page(self) -> Page:
        if self.page is None:
            self.page = await first_page(self.context)
        if self.page.is_closed():
            self.page = await self.context.new_page()
        return self.page

    async def watch(self, login: str) -> None:
        self.current = login
        page = await self.watch_page()
        log(f"Watching {TWITCH_URL}/{login}")
        await page.goto(f"{TWITCH_URL}/{login}", wait_until="domcontentloaded")
        await page.wait_for_timeout(STREAM_SETTLE_WAIT * 1000)
        gate = page.locator(SEL_MATURE_GATE).first
        if await gate.is_visible():
            await gate.click(timeout=CLICK_TIMEOUT_MS)
            log("Accepted the mature-content warning.")
        await self.ensure_playing()

    async def ensure_playing(self) -> None:
        state = await (await self.watch_page()).evaluate(ENSURE_PLAYING_JS)
        if state == "resumed":
            log("The player was paused - resumed it.")
        elif state == "no-video":
            log("No video player found on the page yet.")

    async def watch_step(self) -> None:
        if self.current is None:
            login = await self.find_channel()
            if login is None:
                log(
                    f"No live drops streams for {self.game}. "
                    f"Waiting {NO_STREAMS_WAIT / 60:g} min, then clearing the skip list."
                )
                await asyncio.sleep(NO_STREAMS_WAIT)
                self.skip.clear()
                return
            await self.watch(login)

        await asyncio.sleep(jittered(LIVE_CHECK_INTERVAL, LIVE_CHECK_JITTER))
        current = self.current
        status = await self.stream_status(current)
        if status is None:
            log(f"Could not check {current} - still watching it.")
            return
        if not status.live:
            log(f"{current} went offline - skipping it.")
        elif not same_game(status.game, self.game):
            log(f"{current} switched to {status.game or 'no game'} - skipping it.")
        else:
            # A preferred channel ranked above the current one may have gone live.
            if current in self.preferred:
                better = self.preferred[: self.preferred.index(current)]
            else:
                better = self.preferred
            login = await self.first_live_preferred(better)
            if login:
                log(f"Preferred channel {login} is live with {self.game} - switching.")
                await self.watch(login)
                return
            await self.ensure_playing()
            log(f"{current} is live with {status.game} - still watching.")
            return
        self.skip.add(current)
        self.current = None

    async def watch_loop(self) -> None:
        while True:
            try:
                await self.watch_step()
            except PlaywrightError as exc:
                log(f"Browser error: {short(exc)} - trying again in {ERROR_RETRY_DELAY} s.")
                self.current = None
                await asyncio.sleep(ERROR_RETRY_DELAY)

    # ----- Claiming ----------------------------------------------------------

    async def claim_drops(self) -> None:
        page = await self.context.new_page()
        try:
            await page.goto(INVENTORY_URL, wait_until="domcontentloaded")
            await page.wait_for_timeout(INVENTORY_LOAD_WAIT * 1000)
            if not await page.locator(SEL_USER_MENU).first.is_visible():
                log("Warning: the inventory page shows you as logged out. Run --login again.")
            claimed = 0
            buttons = page.get_by_role("button", name=CLAIM_BUTTON_NAME)
            for button in await buttons.element_handles():
                try:
                    if await button.is_visible() and await button.is_enabled():
                        await button.click(timeout=CLICK_TIMEOUT_MS)
                        claimed += 1
                        await page.wait_for_timeout(AFTER_CLAIM_WAIT * 1000)
                except PlaywrightError:
                    pass  # the button disappeared or re-rendered after an earlier claim
            log(f"Checked the drops inventory: claimed {claimed} drop(s).")
        finally:
            try:
                await page.close()
                if self.page and not self.page.is_closed():
                    await self.page.bring_to_front()
            except PlaywrightError:
                pass

    async def claim_loop(self) -> None:
        await asyncio.sleep(FIRST_CLAIM_DELAY)
        while True:
            try:
                await self.claim_drops()
            except PlaywrightError as exc:
                log(f"Claiming drops failed: {short(exc)}")
            await asyncio.sleep(CLAIM_INTERVAL)


async def farm(pw: Playwright, args: argparse.Namespace) -> int:
    context = await launch(pw, headless=args.headless)
    closed = asyncio.Event()
    context.on("close", lambda *_: closed.set())
    try:
        farmer = DropFarmer(context, args.game, args.channels)
        if not await is_logged_in(await farmer.watch_page()):
            log("Not logged in. Run this first:  py twitch_drops.py --login")
            return 1
        log("Logged in.")
        await farmer.resolve_game()

        closed_task = asyncio.create_task(closed.wait())
        tasks = [
            asyncio.create_task(farmer.watch_loop()),
            asyncio.create_task(farmer.claim_loop()),
            closed_task,
        ]
        try:
            done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
        for task in done:
            if task is not closed_task:
                task.result()  # re-raise an unexpected error from a loop
        log("The browser was closed - exiting.")
        return 0
    finally:
        await close_quietly(context)


# --------------------------------------------------------------------------- #
# Entry point
# --------------------------------------------------------------------------- #


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Farm Twitch Drops by watching streams.",
        epilog='Example: py twitch_drops.py --game "Rust" --channels streamer1,streamer2',
    )
    parser.add_argument("--game", help='game (Twitch category) to farm drops for, e.g. "Rust"')
    parser.add_argument(
        "--channels",
        type=parse_channels,
        default=[],
        metavar="A,B,C",
        help="preferred channels, comma-separated, tried in this order",
    )
    parser.add_argument(
        "--login",
        action="store_true",
        help="open a visible browser to log in by hand (farms afterwards if --game is given)",
    )
    parser.add_argument("--headless", action="store_true", help="farm without a visible browser window")
    args = parser.parse_args(argv)
    if not args.game and not args.login:
        parser.error('--game is required to farm drops, e.g. --game "Rust" (or use --login first)')
    return args


async def run(args: argparse.Namespace) -> int:
    async with async_playwright() as pw:
        if args.login:
            if not await do_login(pw):
                return 1
            if not args.game:
                log('Done. Now farm with e.g.:  py twitch_drops.py --game "Rust"')
                return 0
        return await farm(pw, args)


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="replace")  # odd console encodings never crash a log line
    args = parse_args()
    try:
        return asyncio.run(run(args))
    except KeyboardInterrupt:
        log("Stopped (Ctrl+C).")
        return 0


if __name__ == "__main__":
    sys.exit(main())
