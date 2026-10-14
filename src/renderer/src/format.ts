const relativeTime = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

const timeUnits: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60]
]

export function formatRelativeDate(isoDate: string): string {
  const secondsAgo = (Date.now() - new Date(isoDate).getTime()) / 1000
  for (const [unit, seconds] of timeUnits) {
    if (secondsAgo >= seconds) return relativeTime.format(-Math.floor(secondsAgo / seconds), unit)
  }
  return 'just now'
}

export function formatFullDate(isoDate: string): string {
  return new Date(isoDate).toLocaleString()
}

export function initials(name: string): string {
  const parts = name.split(/[\s._-]+/).filter(Boolean)
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? '?').slice(0, 2)
  return letters.toUpperCase()
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7)
}

/** Lane colors in the spirit of GitKraken's graph palette. */
const laneColors = ['#15a0bf', '#0669f7', '#8e00c2', '#c517b6', '#d90171', '#cd0101', '#f25d2e', '#f2ca33', '#7bd938', '#2ece9d']

export function laneColor(lane: number): string {
  return laneColors[lane % laneColors.length]
}
