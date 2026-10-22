import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

const devStylePolicy = "style-src 'self' 'unsafe-inline'"
const buildStylePolicy = "style-src 'self'"

/**
 * The dev server injects imported CSS as <style> tags, which needs 'unsafe-inline'. The build links a
 * stylesheet instead, and React applies `style` props through the CSSOM, which style-src does not cover,
 * so the shipped page keeps the stricter policy.
 */
function strictStylePolicyInBuild(): Plugin {
  return {
    name: 'kraft:strict-style-policy',
    apply: 'build',
    transformIndexHtml(html) {
      if (!html.includes(devStylePolicy)) throw new Error(`index.html no longer contains "${devStylePolicy}"; update strictStylePolicyInBuild`)
      return html.replace(devStylePolicy, buildStylePolicy)
    }
  }
}

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: { plugins: [react(), strictStylePolicyInBuild()] }
})
