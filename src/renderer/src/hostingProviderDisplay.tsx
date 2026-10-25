import type { ReactNode } from 'react'
import type { HostingProvider } from '../../domain/hostingProvider'
import { AzureDevOpsIcon, BitbucketIcon, GitHubIcon, GitLabIcon } from './components/Icons'

/** How each hosting service is shown in the clone dialog, and how to get a token for it. */
export interface HostingProviderDisplay {
  icon: ReactNode
  addressLabel: string
  addressPlaceholder: string
  usernameLabel: string
  /** Which token to create, and with what permissions. */
  tokenHelp: string
  /** The page that creates a token, given the service's address; null when there is no fixed page. */
  tokenPage: ((serverUrl: string) => string) | null
}

const githubToken: Pick<HostingProviderDisplay, 'tokenHelp' | 'tokenPage'> = {
  tokenHelp: 'A personal access token with the "repo" scope (classic), or a fine-grained token that can read repository contents.',
  tokenPage: (serverUrl) => `${serverUrl}/settings/tokens/new?scopes=repo&description=Kraft`
}

const gitlabToken: Pick<HostingProviderDisplay, 'tokenHelp' | 'tokenPage'> = {
  tokenHelp: 'A personal access token with the "read_api" and "read_repository" scopes.',
  tokenPage: (serverUrl) => `${serverUrl}/-/user_settings/personal_access_tokens?name=Kraft&scopes=read_api,read_repository`
}

const serverAddress = { addressLabel: 'Server address', usernameLabel: '' }

export const hostingProviderDisplay: Record<HostingProvider, HostingProviderDisplay> = {
  github: { icon: <GitHubIcon />, ...serverAddress, addressPlaceholder: '', ...githubToken },
  'github-enterprise': { icon: <GitHubIcon />, ...serverAddress, addressPlaceholder: 'https://github.example.com', ...githubToken },
  gitlab: { icon: <GitLabIcon />, ...serverAddress, addressPlaceholder: '', ...gitlabToken },
  'gitlab-self-managed': { icon: <GitLabIcon />, ...serverAddress, addressPlaceholder: 'https://gitlab.example.com', ...gitlabToken },
  bitbucket: {
    icon: <BitbucketIcon />,
    ...serverAddress,
    addressPlaceholder: '',
    usernameLabel: 'Email (API token) or user name (app password)',
    tokenHelp: 'An Atlassian API token with the "read:repository:bitbucket" and "read:user:bitbucket" scopes, or an app password that can read repositories.',
    tokenPage: () => 'https://id.atlassian.com/manage-profile/security/api-tokens'
  },
  'bitbucket-data-center': {
    icon: <BitbucketIcon />,
    ...serverAddress,
    addressPlaceholder: 'https://bitbucket.example.com',
    tokenHelp: 'An HTTP access token with "Repository read" permission, made under your avatar → Manage account → HTTP access tokens.',
    tokenPage: null
  },
  'azure-devops': {
    icon: <AzureDevOpsIcon />,
    addressLabel: 'Organization',
    addressPlaceholder: 'my-organization or https://dev.azure.com/my-organization',
    usernameLabel: '',
    tokenHelp: 'A personal access token with the "Code (Read)" scope for this organization.',
    tokenPage: (serverUrl) => `${serverUrl}/_usersSettings/tokens`
  }
}
