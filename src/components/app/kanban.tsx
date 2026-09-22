'use client'

import { useState } from 'react'
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Check, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface KanbanColumnDef {
  id: string
  title: string
  hint?: string
  /** column accent color (hex) — renders a dot before the title */
  color?: string | null
  /** marks a terminal "done" column — emerald check next to the title, data-done attr */
  isDone?: boolean
  /** marks a terminal "rejected" column — muted X next to the title, data-rejected attr */
  isRejected?: boolean
}

interface KanbanItem {
  id: string
}

/** Human-readable card name for aria-labels — views pass tasks (title), deals
 *  (name) or recruitment applications (candidateName); falls back to the id. */
function cardName(item: KanbanItem): string {
  const named = item as { title?: string; name?: string; candidateName?: string }
  return named.title ?? named.name ?? named.candidateName ?? item.id
}

function KanbanColumn<T extends KanbanItem>({
  col,
  items,
  columnOf,
  renderCard,
  onCardClick,
  renderColumnMenu,
}: {
  col: KanbanColumnDef
  items: T[]
  columnOf: (item: T) => string
  renderCard: (item: T) => React.ReactNode
  onCardClick?: (item: T) => void
  /** optional per-column "⋯" menu node (the view renders its own DropdownMenu) */
  renderColumnMenu?: (col: KanbanColumnDef) => React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${col.id}` })
  const colItems = items.filter((i) => columnOf(i) === col.id)

  return (
    <div
      ref={setNodeRef}
      data-done={col.isDone ? 'true' : undefined}
      data-rejected={col.isRejected ? 'true' : undefined}
      className={cn(
        'kanban-col flex w-72 shrink-0 flex-col rounded-xl border bg-muted/40 md:w-80',
        isOver && 'border-emerald-500/60 bg-emerald-500/5'
      )}
      role="group"
      aria-label={col.title}
    >
      <div className="flex items-center justify-between gap-1 px-3 pb-2 pt-3">
        <div className="flex min-w-0 items-center gap-1.5">
          {col.color && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: col.color }} aria-hidden />}
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">{col.title}</p>
          {col.isDone && <Check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="done column" />}
          {col.isRejected && <X className="size-3.5 shrink-0 text-muted-foreground/70" aria-label="rejected column" />}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{colItems.length}</span>
          {renderColumnMenu?.(col)}
        </div>
      </div>
      <div className="flex max-h-[65vh] min-h-24 flex-col gap-2 overflow-y-auto px-2 pb-3">
        <SortableContext items={colItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {colItems.map((item) => (
            <SortableCard
              key={item.id}
              item={item}
              columnLabel={col.title}
              renderCard={renderCard}
              onClick={onCardClick}
            />
          ))}
        </SortableContext>
        {colItems.length === 0 && (
          <div className="flex min-h-16 items-center justify-center rounded-lg border border-dashed text-[11px] text-muted-foreground">
            Drop here
          </div>
        )}
      </div>
    </div>
  )
}

function SortableCard<T extends KanbanItem>({
  item,
  columnLabel,
  renderCard,
  onClick,
}: {
  item: T
  columnLabel: string
  renderCard: (item: T) => React.ReactNode
  onClick?: (item: T) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={cn('cursor-grab touch-none select-none rounded-lg', isDragging && 'dragging-card')}
      onClick={() => onClick?.(item)}
      role="button"
      aria-label={`${cardName(item)} · ${columnLabel}`}
    >
      {renderCard(item)}
    </div>
  )
}

/**
 * Generic drag-and-drop kanban board. Items are distributed into columns via
 * `columnOf`; dropping a card on another column (or its cards) calls `onMove`.
 *
 * T3-h extensions:
 * - `KanbanColumnDef.color / isDone / isRejected` drive the header dot / check / X
 *   marks and set `data-done` / `data-rejected` attrs on the column wrapper so views
 *   can style their cards (dimming is decided by the views via `renderCard`).
 * - `renderColumnMenu(col)` renders a compact "⋯" menu button in each column header —
 *   the view provides the actual DropdownMenu (rename / move / delete …).
 * - `onAddColumn` renders a ghost dashed "+ Add column" column at the end of the board.
 */
export function KanbanBoard<T extends KanbanItem>({
  columns,
  items,
  columnOf,
  onMove,
  renderCard,
  onCardClick,
  renderColumnMenu,
  onAddColumn,
  addColumnLabel,
  className,
}: {
  columns: KanbanColumnDef[]
  items: T[]
  columnOf: (item: T) => string
  onMove: (item: T, targetColumnId: string) => void | Promise<void>
  renderCard: (item: T) => React.ReactNode
  onCardClick?: (item: T) => void
  /** optional per-column "⋯" menu node rendered inside each column header */
  renderColumnMenu?: (col: KanbanColumnDef) => React.ReactNode
  /** renders a dashed "+ Add column" ghost column at the end of the board */
  onAddColumn?: () => void
  /** ghost button noun — 'Add column' (boards) / 'Add stage' (pipeline boards) */
  addColumnLabel?: string
  className?: string
}) {
  const [activeItem, setActiveItem] = useState<T | null>(null)
  // Pointer drag for mouse/touch + KeyboardSensor so cards are also draggable
  // with Enter/Space + arrow keys (sortableKeyboardCoordinates).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function findColumn(id: string): string | null {
    if (id.startsWith('col:')) return id.slice(4)
    const item = items.find((i) => i.id === id)
    return item ? columnOf(item) : null
  }

  function handleStart(e: DragStartEvent) {
    const item = items.find((i) => i.id === e.active.id)
    setActiveItem(item ?? null)
  }

  async function handleEnd(e: DragEndEvent) {
    setActiveItem(null)
    const { active, over } = e
    if (!over) return
    const from = findColumn(String(active.id))
    const to = findColumn(String(over.id))
    if (!from || !to || from === to) return
    const item = items.find((i) => i.id === active.id)
    if (item) await onMove(item, to)
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleStart} onDragEnd={handleEnd}>
      <div className={cn('kanban-scroll flex gap-3 pb-2', className)}>
        {columns.map((col) => (
          <KanbanColumn
            key={col.id}
            col={col}
            items={items}
            columnOf={columnOf}
            renderCard={renderCard}
            onCardClick={onCardClick}
            renderColumnMenu={renderColumnMenu}
          />
        ))}
        {onAddColumn && (
          <button
            type="button"
            onClick={onAddColumn}
            aria-label={addColumnLabel ?? 'Add column'}
            className="flex min-h-24 w-72 shrink-0 flex-col items-center justify-center gap-2 self-stretch rounded-xl border border-dashed text-sm font-medium text-muted-foreground transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/5 hover:text-foreground md:w-80"
          >
            <Plus className="size-4" aria-hidden />
            {addColumnLabel ?? 'Add column'}
          </button>
        )}
      </div>
      <DragOverlay>
        {activeItem ? <div className="w-72 rotate-2 rounded-lg shadow-lg md:w-80">{renderCard(activeItem)}</div> : null}
      </DragOverlay>
    </DndContext>
  )
}
