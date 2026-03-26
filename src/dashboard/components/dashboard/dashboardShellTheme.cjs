const dashboardShellRootClassName =
  'relative h-full min-h-screen w-full flex bg-white text-zinc-900 dark:bg-[#111] dark:text-zinc-100'

const dashboardSidebarClassName = [
  'w-[190px] h-full flex-none flex flex-col border-r border-zinc-200 bg-zinc-50/90',
  'dark:border-zinc-800/80 dark:bg-[#111]'
].join(' ')

const dashboardSidebarMenuButtonClassName = [
  'w-full flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[14px] font-medium transition-colors',
  'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900',
  'data-[active=true]:border data-[active=true]:border-zinc-200/60 data-[active=true]:bg-white data-[active=true]:text-zinc-900 data-[active=true]:shadow-sm',
  'dark:text-zinc-400 dark:hover:bg-zinc-900/80 dark:hover:text-zinc-200',
  'dark:data-[active=true]:border-zinc-800 dark:data-[active=true]:bg-zinc-900/90 dark:data-[active=true]:text-zinc-100 dark:data-[active=true]:shadow-none'
].join(' ')

module.exports = {
  dashboardShellRootClassName,
  dashboardSidebarClassName,
  dashboardSidebarMenuButtonClassName
}
