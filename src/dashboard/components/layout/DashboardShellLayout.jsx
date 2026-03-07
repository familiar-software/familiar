import React from 'react'

import { Button } from '../ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '../ui/sidebar'

export function DashboardShellLayout({
  activeSection,
  children,
  isWizardCompleted,
  navigation,
  globalMessage,
  globalError,
  toDisplayText,
  appName,
  updatesCheckForUpdatesLabel,
  onSectionSelect,
  onCheckForUpdates,
  isCheckingForUpdates,
  updateMessage,
  updateError,
  updatesState
}) {
  const isWizardSection = activeSection === 'wizard'
  const appLabel = toDisplayText(appName) || 'Familiar'
  const updatesLabel = toDisplayText(updateMessage)
  const updatesErrorText = toDisplayText(updateError)
  const updatesPercent = Number(updatesState?.percent)
  const updatesProgressLabel = toDisplayText(updatesState?.label)
  const showUpdatesProgress = updatesState?.visible === true
  const showUpdatesProgressLabel = showUpdatesProgress && updatesProgressLabel.length > 0
  const sectionTitle = {
    wizard: 'Setup Wizard',
    storage: 'Storage',
    heartbeats: 'Heartbeats',
    recording: 'Capturing',
    'install-skill': 'Connect Agent',
    installSkill: 'Connect Agent'
  }[activeSection] || 'Storage'

  const renderSectionIcon = (id) => {
    if (id === 'wizard') {
      return <path d="M12 3v3m0 12v3m9-9h-3M6 12H3m14.1-7.1-2.1 2.1M9 15l-2.1 2.1m10.2 0L15 15M9 9 6.9 6.9" />
    }

    if (id === 'storage') {
      return (
        <>
          <path d="M12 4c-4.4 0-8 1.3-8 3v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7c0-1.7-3.6-3-8-3Z" />
          <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
          <path d="M4 7c0 1.7 3.6 3 8 3s8-1.3 8-3" />
        </>
      )
    }

    if (id === 'recording') {
      return (
        <>
          <rect x="3" y="7" width="13" height="10" rx="2" />
          <path d="M16 9.5 21 7v10l-5-2.5" />
        </>
      )
    }

    if (id === 'heartbeats') {
      return (
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 4.97l-1.06-0.36a5.5 5.5 0 1 0-7.78 7.78L12 21.17l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" />
      )
    }

    if (id === 'install-skill' || id === 'installSkill') {
      return (
        <>
          <path d="M12 8V4H8" />
          <rect width="16" height="12" x="4" y="8" rx="2" />
          <path d="M2 14h2" />
          <path d="M20 14h2" />
          <path d="M15 13v2" />
          <path d="M9 13v2" />
        </>
      )
    }

    return (
      <>
        <path d="M12 3v6" />
        <path d="m9 6 3-3 3 3" />
        <path d="M5 13v6h14v-6" />
        <path d="M8 13h8" />
      </>
    )
  }

  return (
    <div className="relative h-full min-h-screen w-full flex">
      <Sidebar
        id="settings-sidebar"
        className={isWizardCompleted ? '' : 'hidden'}
      >
        <SidebarHeader>
          <img src="../icon.png" alt="" className="w-5 h-5 rounded-md object-cover shadow-sm" />
          <span className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">{appLabel}</span>
          <span id="app-version" className="text-xs font-medium text-zinc-500 dark:text-zinc-400" aria-label="" />
        </SidebarHeader>

        <SidebarContent>
          <nav role="tablist" aria-label="">
            <SidebarMenu>
              {navigation.map((entry) => {
                const isHidden = isWizardCompleted && entry.id === 'wizard'
                return (
                  <SidebarMenuItem key={entry.id}>
                    <SidebarMenuButton
                      data-section-target={entry.id}
                      aria-controls={`section-${entry.id}`}
                      aria-selected={activeSection === entry.id}
                      role="tab"
                      type="button"
                      isActive={activeSection === entry.id}
                      onClick={() => {
                        onSectionSelect(entry.id)
                      }}
                      hidden={isHidden}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        aria-hidden="true"
                      >
                        {renderSectionIcon(entry.id)}
                      </svg>
                      {entry.label}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </nav>
        </SidebarContent>

        <SidebarFooter>
          <Button
            id="updates-sidebar-check"
            data-action="updates-check"
            type="button"
            variant="outline"
            onClick={onCheckForUpdates}
            disabled={Boolean(isCheckingForUpdates)}
            className="w-full text-xs font-semibold"
          >
            {updatesCheckForUpdatesLabel || 'Check for updates'}
          </Button>
          <span
            id="updates-sidebar-status"
            data-setting-status="updates-status"
            className={`mt-2 block text-xs text-emerald-600 dark:text-emerald-400 ${updatesLabel ? '' : 'hidden'}`}
            aria-live="polite"
          >
            {updatesLabel}
          </span>
          <div
            id="updates-sidebar-progress"
            className={`mt-2 space-y-2 ${showUpdatesProgress ? '' : 'hidden'}`}
            aria-live="polite"
          >
            <div className="h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
              <div
                id="updates-sidebar-progress-bar"
                className="h-full bg-emerald-500 transition-[width] duration-200"
                style={{ width: `${Number.isFinite(updatesPercent) ? updatesPercent : 0}%` }}
              />
            </div>
            <span
              id="updates-sidebar-progress-label"
              className={`text-xs text-zinc-500 dark:text-zinc-400 ${showUpdatesProgressLabel ? '' : 'hidden'}`}
            >
              {updatesProgressLabel}
            </span>
          </div>
          <p
            id="updates-sidebar-error"
            data-setting-error="updates-error"
            className={`mt-2 text-xs text-red-600 dark:text-red-400 ${updatesErrorText ? '' : 'hidden'}`}
            role="alert"
            aria-live="polite"
          >
            {updatesErrorText}
          </p>
        </SidebarFooter>
      </Sidebar>

      <main className="flex-1 flex flex-col min-h-0 h-full bg-white dark:bg-[#111]">
        <h1 id="section-title" className="sr-only">
          {toDisplayText(sectionTitle)}
        </h1>
        {isWizardSection ? (
          children
        ) : (
          <section className="flex-1 p-6 space-y-6 scrollbar-slim overflow-y-auto">
            <div id="global-message" role="status" aria-live="polite">
              {globalMessage ? <span className="text-emerald-600 dark:text-emerald-400 text-xs">{toDisplayText(globalMessage)}</span> : null}
              {globalError ? <span className="text-red-600 dark:text-red-400 text-xs">{toDisplayText(globalError)}</span> : null}
            </div>
            {children}
          </section>
        )}
      </main>
    </div>
  )
}
