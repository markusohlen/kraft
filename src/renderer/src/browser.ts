export function openInBrowser(url: string): void {
  // The main process sends new-window requests for web links to the default browser.
  window.open(url)
}
