import React from 'react'

export function DashboardErrorBoundary({ children, microcopy }) {
  return (
    <DashboardErrorBoundaryInner children={children} microcopy={microcopy} />
  )
}

class DashboardErrorBoundaryInner extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, message: 'unknown error', stack: '' }
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error && typeof error.message === 'string' ? error.message : 'unknown error',
      stack: error && typeof error.stack === 'string' ? error.stack : ''
    }
  }

  componentDidCatch(error, info) {
    console.error('React dashboard render error', error, info)
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }
    const appName =
      toDisplayText(this.props.microcopy?.app?.name) ||
      toDisplayText(this.props.microcopy?.dashboard?.html?.appName) ||
      'Familiar'
    const errorTitle =
      toDisplayText(this.props.microcopy?.dashboard?.errors?.reactInitializationFailed) ||
      'Unable to initialize the React dashboard.'

    return (
      <div className="react-fallback">
        <h1>{appName}</h1>
        <p>{errorTitle}</p>
        <p>{toDisplayText(this.state.message)}</p>
      </div>
    )
  }
}

function toDisplayText(value) {
  if (typeof value === 'string') {
    return value
  }
  return ''
}
