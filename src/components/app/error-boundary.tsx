'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Class-based React error boundary around the workspace module view. Catches
 * render faults in a single module instead of white-screening the whole SPA.
 * Remounted by the shell when the module (or its params) changes, which also
 * resets the error state — the "Try again" button does the same on demand.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] module view crashed:', error, info.componentStack)
  }

  reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <Card className="w-full py-0" role="alert">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center sm:p-10">
          <div className="flex size-11 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="size-5" aria-hidden />
          </div>
          <div className="flex flex-col gap-1.5">
            <h2 className="text-lg font-semibold tracking-tight">Something went wrong</h2>
            <p className="max-w-md truncate select-text text-sm text-muted-foreground" title={error.message}>
              {error.message || 'An unexpected error occurred while rendering this module.'}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={this.reset} className="min-h-11">
              <RotateCcw className="size-4" aria-hidden />
              Try again
            </Button>
            <Button variant="outline" className="min-h-11" onClick={() => window.location.reload()}>
              Reload page
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }
}
