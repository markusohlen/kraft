import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { githubAvatarUrl, gravatarUrl, initialsColor, profilePictureUrl } from '../../src/renderer/src/avatars'

describe('gravatarUrl', () => {
  it('looks the email up by its SHA-256 hash, ignoring case and surrounding spaces', async () => {
    const hash = createHash('sha256').update('ada@example.com').digest('hex')

    expect(await gravatarUrl('  Ada@Example.COM ')).toBe(`https://www.gravatar.com/avatar/${hash}?s=64&d=404`)
  })

  it('never puts the email address itself in the URL', async () => {
    expect(await gravatarUrl('ada@example.com')).not.toContain('example')
  })
})

describe('githubAvatarUrl', () => {
  it('uses the account number in a GitHub no-reply address', () => {
    expect(githubAvatarUrl('42910640+markusohlen@users.noreply.github.com')).toBe('https://avatars.githubusercontent.com/u/42910640?s=64')
  })

  it('uses the user name in the older no-reply addresses without a number', () => {
    expect(githubAvatarUrl('Octo-Cat@users.noreply.github.com')).toBe('https://github.com/Octo-Cat.png?size=64')
  })

  it('ignores every other address, including look-alikes', () => {
    expect(githubAvatarUrl('ada@example.com')).toBeNull()
    expect(githubAvatarUrl('ada@users.noreply.github.com.evil.example')).toBeNull()
    expect(githubAvatarUrl('../x@users.noreply.github.com')).toBeNull()
  })
})

describe('profilePictureUrl', () => {
  it('prefers the GitHub picture for no-reply addresses and Gravatar otherwise', async () => {
    expect(await profilePictureUrl('1+octo@users.noreply.github.com')).toBe('https://avatars.githubusercontent.com/u/1?s=64')
    expect(await profilePictureUrl('ada@example.com')).toBe(await gravatarUrl('ada@example.com'))
  })
})

describe('initialsColor', () => {
  it('puts light initials on deep lane colors', () => {
    expect(initialsColor('#0669f7')).toBe('#ffffff')
    expect(initialsColor('#8e00c2')).toBe('#ffffff')
    expect(initialsColor('#cd0101')).toBe('#ffffff')
  })

  it('puts dark initials on pale lane colors', () => {
    expect(initialsColor('#f2ca33')).toBe('#1b1e25')
    expect(initialsColor('#7bd938')).toBe('#1b1e25')
    expect(initialsColor('#2ece9d')).toBe('#1b1e25')
  })

  it('rejects colors it cannot read', () => {
    expect(() => initialsColor('teal')).toThrow('not a #rrggbb color')
  })
})
