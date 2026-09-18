'use client'

/**
 * Shared board-column CRUD affordances (T3-h) — the per-column "⋯" menu
 * (rename / change color / move left-right / done + rejected toggles /
 * delete-with-moveTo) and the "+ Add column" dialog.
 *
 * Used by every dynamic board:
 * - my-tasks-view, tasks-view, projects-view tasks tab → TASK BoardColumns (/api/columns)
 * - recruit-candidates-view → HIRING BoardColumns (/api/columns)
 * - crm-deals-view → pipeline stages (/api/crm/stages)
 *
 * This module is presentation-only: every mutation is performed by a handler
 * supplied by the view (which owns the API call + refresh + toast).
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Check, ChevronLeft, ChevronRight, MoreHorizontal, Palette, Pencil, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------- shared palette (swatch radios mirror the project dialog pattern) ----------

export const COLUMN_COLORS = ['#10b981', '#14b8a6', '#64748b', '#94a3b8', '#f59e0b', '#fbbf24', '#f97316', '#f43f5e', '#8b5cf6', '#84cc16'] as const

// ---------- normalized column shape handed to the menu ----------

export interface CrudColumn {
  /** real API row id (BoardColumn.id / PipelineStage.id) — used by PATCH / DELETE */
  id: string
  /** board key (BoardColumn.key) when the board is column-key driven */
  key?: string
  title: string
  color?: string | null
  isDone?: boolean
  isRejected?: boolean
  /** how many items currently sit in this column (drives the delete dialog copy) */
  cardCount: number
}

export interface ColumnCrudLabels {
  /** 'column' | 'stage' — used in dialog titles / aria labels */
  boardName: string
  /** singular noun: 'card' | 'deal' | 'candidate' */
  noun: string
  /** e.g. 'Done column' / 'Won stage' / 'Hired stage' */
  done: string
  /** e.g. 'Lost stage' / 'Rejected stage' — omit to hide the rejected toggle */
  rejected?: string
  /** e.g. 'Add column' / 'Add stage' */
  addTitle: string
}

// ---------- swatch row (rename-color dialog + add dialog share it) ----------

function ColorSwatches({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Column color">
      <button
        type="button"
        role="radio"
        aria-checked={value === null}
        aria-label="No color"
        onClick={() => onChange(null)}
        className={cn(
          'flex size-9 items-center justify-center rounded-lg border border-dashed text-muted-foreground transition-colors hover:bg-muted',
          value === null && 'border-foreground/40 bg-muted'
        )}
      >
        {value === null && <span className="text-[10px] font-medium">None</span>}
      </button>
      {COLUMN_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={`Color ${c}`}
          onClick={() => onChange(c)}
          className={cn(
            'flex size-9 items-center justify-center rounded-lg border-2 transition-transform hover:scale-105',
            value === c ? 'border-foreground/60' : 'border-transparent'
          )}
          style={{ backgroundColor: `${c}33` }}
        >
          <span className={cn('size-4 rounded-full', value === c && 'ring-2 ring-background')} style={{ backgroundColor: c }} aria-hidden />
        </button>
      ))}
    </div>
  )
}

// ---------- the "⋯" column menu (dropdown + all its dialogs) ----------

export interface ColumnMenuHandlers {
  rename: (col: CrudColumn, label: string) => Promise<void>
  /** omit for boards whose columns have no color (pipeline stages) */
  recolor?: (col: CrudColumn, color: string | null) => Promise<void>
  move: (col: CrudColumn, direction: 'left' | 'right') => Promise<void>
  toggleDone: (col: CrudColumn, next: boolean) => Promise<void>
  toggleRejected?: (col: CrudColumn, next: boolean) => Promise<void>
  delete: (col: CrudColumn, moveToId: string) => Promise<void>
}

export function ColumnMenu({
  col, siblings, isFirst, isLast, isOnly, labels, handlers,
}: {
  col: CrudColumn
  /** every column of the board (used for the delete target options) */
  siblings: CrudColumn[]
  isFirst: boolean
  isLast: boolean
  /** the board has a single column → delete disabled client-side too */
  isOnly: boolean
  labels: ColumnCrudLabels
  handlers: ColumnMenuHandlers
}) {
  const [renameOpen, setRenameOpen] = useState(false)
  const [colorOpen, setColorOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [labelDraft, setLabelDraft] = useState(col.title)
  const [colorDraft, setColorDraft] = useState<string | null>(col.color ?? null)
  const [moveTo, setMoveTo] = useState<string>(siblings.find((s) => s.id !== col.id)?.id ?? '')
  const [busy, setBusy] = useState(false)
  const recolor = handlers.recolor
  const toggleRejected = handlers.toggleRejected

  const cap = labels.boardName[0].toUpperCase() + labels.boardName.slice(1)
  const others = siblings.filter((s) => s.id !== col.id)

  async function run(fn: () => Promise<void>, close?: () => void) {
    setBusy(true)
    try {
      await fn()
      close?.()
    } catch { /* handler toasts via api() */ } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-foreground data-[state=open]:bg-muted"
            aria-label={`${cap} actions for ${col.title}`}
          >
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuItem onSelect={() => { setLabelDraft(col.title); setRenameOpen(true) }}>
            <Pencil aria-hidden /> Rename
          </DropdownMenuItem>
          {handlers.recolor && (
            <DropdownMenuItem onSelect={() => { setColorDraft(col.color ?? null); setColorOpen(true) }}>
              <Palette aria-hidden /> Change color
            </DropdownMenuItem>
          )}
          <DropdownMenuItem disabled={isFirst} onSelect={() => void run(() => handlers.move(col, 'left'))}>
            <ChevronLeft aria-hidden /> Move left
          </DropdownMenuItem>
          <DropdownMenuItem disabled={isLast} onSelect={() => void run(() => handlers.move(col, 'right'))}>
            <ChevronRight aria-hidden /> Move right
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => void run(() => handlers.toggleDone(col, !col.isDone))}
          >
            <span className="flex size-4 items-center justify-center">
              {col.isDone ? <Check className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden /> : <span className="size-2 rounded-full border border-muted-foreground/50" aria-hidden />}
            </span>
            {labels.done}
          </DropdownMenuItem>
          {labels.rejected && toggleRejected && (
            <DropdownMenuItem onSelect={() => void run(() => toggleRejected(col, !col.isRejected))}>
              <span className="flex size-4 items-center justify-center">
                {col.isRejected
                  ? <span className="block h-0.5 w-3.5 rounded bg-rose-500/70" aria-hidden />
                  : <span className="size-2 rounded-full border border-muted-foreground/50" aria-hidden />}
              </span>
              {labels.rejected}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={isOnly}
            onSelect={() => { setMoveTo(others[0]?.id ?? ''); setDeleteOpen(true) }}
          >
            <Trash2 aria-hidden /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* rename */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename {labels.boardName}</DialogTitle>
            <DialogDescription>Renaming keeps the column&apos;s cards and board position.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`col-rename-${col.id}`}>Label</Label>
            <Input
              id={`col-rename-${col.id}`}
              value={labelDraft}
              className="h-11"
              maxLength={40}
              autoFocus
              onChange={(e) => setLabelDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && labelDraft.trim() && labelDraft.trim() !== col.title) void run(() => handlers.rename(col, labelDraft.trim()), () => setRenameOpen(false)) }}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" className="h-11" onClick={() => setRenameOpen(false)}>Cancel</Button>
            <Button className="h-11" disabled={busy || !labelDraft.trim() || labelDraft.trim() === col.title}
              onClick={() => void run(() => handlers.rename(col, labelDraft.trim()), () => setRenameOpen(false))}>
              {busy ? 'Saving…' : 'Rename'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* color */}
      {recolor && (
        <Dialog open={colorOpen} onOpenChange={setColorOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Change color</DialogTitle>
              <DialogDescription>Accent color for “{col.title}” — shown as a dot on the column header.</DialogDescription>
            </DialogHeader>
            <ColorSwatches value={colorDraft} onChange={setColorDraft} />
            <DialogFooter>
              <Button variant="ghost" className="h-11" onClick={() => setColorOpen(false)}>Cancel</Button>
              <Button className="h-11" disabled={busy || colorDraft === (col.color ?? null)}
                onClick={() => void run(() => recolor(col, colorDraft), () => setColorOpen(false))}>
                {busy ? 'Saving…' : 'Save color'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* delete + moveTo */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {labels.boardName} “{col.title}”?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-3 text-sm text-muted-foreground">
                <span>
                  Its {col.cardCount} {labels.noun}
                  {col.cardCount === 1 ? ' moves to:' : 's move to:'}
                </span>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`col-move-${col.id}`}>Target {labels.boardName}</Label>
                  <Select value={moveTo} onValueChange={setMoveTo}>
                    <SelectTrigger id={`col-move-${col.id}`} className="h-11 w-full" aria-label="Target column for the moved cards">
                      <SelectValue placeholder={`Choose a ${labels.boardName}…`} />
                    </SelectTrigger>
                    <SelectContent>
                      {others.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11" disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 bg-rose-600 hover:bg-rose-700"
              disabled={busy || !moveTo}
              onClick={(e) => { e.preventDefault(); void run(() => handlers.delete(col, moveTo), () => setDeleteOpen(false)) }}
            >
              {busy ? 'Deleting…' : `Delete ${labels.boardName}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ---------- "+ Add column" dialog ----------

export interface AddColumnDraft {
  label: string
  color: string | null
  isDone: boolean
  isRejected: boolean
}

export function AddColumnDialog({
  open, onOpenChange, labels, onCreate, showColor = true, showRejected = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  labels: ColumnCrudLabels
  onCreate: (draft: AddColumnDraft) => Promise<void>
  /** pipeline stages have no color */
  showColor?: boolean
  /** TASK boards expose only the done switch; hiring/deals expose won+lost */
  showRejected?: boolean
}) {
  const [label, setLabel] = useState('')
  const [color, setColor] = useState<string | null>(COLUMN_COLORS[1])
  const [isDone, setIsDone] = useState(false)
  const [isRejected, setIsRejected] = useState(false)
  const [busy, setBusy] = useState(false)

  function reset() {
    setLabel('')
    setColor(COLUMN_COLORS[1])
    setIsDone(false)
    setIsRejected(false)
  }

  async function create() {
    setBusy(true)
    try {
      await onCreate({ label: label.trim(), color, isDone, isRejected })
      reset()
      onOpenChange(false)
    } catch { /* handler toasts via api() */ } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{labels.addTitle}</DialogTitle>
          <DialogDescription>
            New {labels.boardName} at the end of the board{labels.done ? ` — “${labels.done}” marks it as a terminal stage` : ''}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-col-label">Label *</Label>
            <Input
              id="new-col-label"
              value={label}
              className="h-11"
              maxLength={40}
              autoFocus
              placeholder="e.g. QA review"
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && label.trim()) void create() }}
            />
          </div>
          {showColor && (
            <div className="flex flex-col gap-2">
              <Label>Color</Label>
              <ColorSwatches value={color} onChange={setColor} />
            </div>
          )}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/30 p-3">
              <div className="min-w-0">
                <Label htmlFor="new-col-done" className="text-sm">{labels.done}</Label>
                <p className="mt-0.5 text-xs text-muted-foreground">Cards in this column count as completed.</p>
              </div>
              <Switch id="new-col-done" checked={isDone} onCheckedChange={setIsDone} />
            </div>
            {showRejected && labels.rejected && (
              <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/30 p-3">
                <div className="min-w-0">
                  <Label htmlFor="new-col-rejected" className="text-sm">{labels.rejected}</Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">Cards here are terminal and dimmed.</p>
                </div>
                <Switch id="new-col-rejected" checked={isRejected} onCheckedChange={setIsRejected} />
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" className="h-11" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="h-11 gap-1.5" disabled={busy || !label.trim()} onClick={() => void create()}>
            {busy ? 'Adding…' : <><Plus className="size-4" aria-hidden /> Add {labels.boardName}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
