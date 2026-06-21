import React from 'react'
import { createPortal } from 'react-dom'
import {
  IconChevronDown,
  IconChevronRight,
  IconDotsVertical,
  IconEye,
  IconEyeOff,
  IconFocusCentered,
  IconFolder,
  IconTrash,
  IconUser,
} from '@tabler/icons-react'
import { cn } from '../../../../utils/cn'
import {
  type Scene3DCamera,
  type Scene3DObject,
  type Scene3DSelection,
  type Scene3DTrajectory,
  type Scene3DTrajectoryGroup,
} from './scene3dTypes'
import {
  FULLSCREEN_Z_INDEX,
  crowdCount,
  mannequinRoleLabel,
  roleColorForIndex,
} from './scene3dShared'

export const SceneObjectList = React.memo(function SceneObjectList({
  objects,
  cameras,
  selection,
  readOnly,
  onSelect,
  onFocus,
  onObjectPatch,
  onCameraPatch,
  onDelete,
}: {
  objects: Scene3DObject[]
  cameras: Scene3DCamera[]
  selection: Scene3DSelection
  readOnly: boolean
  onSelect: (selection: Scene3DSelection) => void
  onFocus: (id: string) => void
  onObjectPatch: (id: string, patch: Partial<Scene3DObject>) => void
  onCameraPatch: (id: string, patch: Partial<Scene3DCamera>) => void
  onDelete: (selection: Exclude<Scene3DSelection, null>) => void
}): JSX.Element {
  const [renaming, setRenaming] = React.useState<string>('')
  const [expandedCrowds, setExpandedCrowds] = React.useState<Record<string, boolean>>({})
  const rows = React.useMemo(() => {
    let roleIndex = 0
    const objectRows = objects.map((object) => {
      const roleStartIndex = object.type === 'mannequin' || object.type === 'mannequinCrowd'
        ? roleIndex
        : undefined
      if (object.type === 'mannequin') roleIndex += 1
      if (object.type === 'mannequinCrowd') roleIndex += crowdCount(object)
      return {
        id: object.id,
        type: 'object' as const,
        name: object.name,
        visible: object.visible,
        object,
        roleStartIndex,
      }
    })
    return [
      ...objectRows,
      ...cameras.map((camera) => ({
        id: camera.id,
        type: 'camera' as const,
        name: camera.name,
        visible: camera.visible,
        camera,
        roleStartIndex: undefined,
      })),
    ]
  }, [cameras, objects])

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--nomi-paper)]">
      <div className="flex shrink-0 items-center justify-between px-3 py-2">
        <h3 className="m-0 text-[12px] font-medium text-[var(--nomi-ink)]">场景节点</h3>
        <span className="text-[11px] text-[var(--nomi-ink-60)]">{rows.length}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
        {rows.map((row) => {
          const selected = selection?.type === row.type && selection.id === row.id
          const rowObject = row.type === 'object' ? row.object : undefined
          const isCrowd = rowObject?.type === 'mannequinCrowd'
          const crowdExpanded = isCrowd ? expandedCrowds[row.id] ?? true : false
          return (
            <React.Fragment key={row.id}>
              <div
                className={cn(
                  'group grid grid-cols-[22px_24px_minmax(0,1fr)_28px_28px] items-center gap-1 rounded-[7px] px-1 py-1',
                  'text-[var(--nomi-ink-60)] hover:bg-[var(--nomi-ink-05)]',
                  selected && 'bg-[var(--nomi-ink-05)] text-[var(--nomi-ink)]',
                )}
                onDoubleClick={() => {
                  if (!readOnly) setRenaming(row.id)
                  onFocus(row.id)
                }}
              >
                {isCrowd ? (
                  <button
                    className="grid size-6 place-items-center rounded-[6px] text-[var(--nomi-ink-45)] hover:bg-[var(--nomi-ink-05)] hover:text-[var(--nomi-ink)]"
                    type="button"
                    title={crowdExpanded ? '收起群众' : '展开群众'}
                    onClick={() => setExpandedCrowds((current) => ({ ...current, [row.id]: !crowdExpanded }))}
                  >
                    {crowdExpanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                  </button>
                ) : (
                  <span aria-hidden="true" className="size-6" />
                )}
                <button
                  className="grid size-6 place-items-center rounded-[6px] text-[var(--nomi-ink-60)] hover:bg-[var(--nomi-ink-05)] hover:text-[var(--nomi-ink)]"
                  type="button"
                  title="聚焦"
                  onClick={() => onFocus(row.id)}
                >
                  <IconFocusCentered size={14} />
                </button>
                {renaming === row.id ? (
                  <input
                    autoFocus
                    className="h-7 min-w-0 rounded-[6px] border border-[var(--nomi-line)] bg-[var(--nomi-paper)] px-2 text-[12px] text-[var(--nomi-ink)] outline-none"
                    defaultValue={row.name}
                    onBlur={(event) => {
                      const name = event.currentTarget.value.trim()
                      if (name) {
                        if (row.type === 'object') onObjectPatch(row.id, { name })
                        else onCameraPatch(row.id, { name })
                      }
                      setRenaming('')
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur()
                      if (event.key === 'Escape') setRenaming('')
                    }}
                  />
                ) : (
                  <button
                    className="min-w-0 truncate bg-transparent p-0 text-left text-[12px] text-inherit"
                    type="button"
                    onClick={() => onSelect({ type: row.type, id: row.id })}
                  >
                    {row.name}
                  </button>
                )}
                <button
                  className="grid size-7 place-items-center rounded-[6px] text-[var(--nomi-ink-60)] hover:bg-[var(--nomi-ink-05)] hover:text-[var(--nomi-ink)] disabled:opacity-40"
                  disabled={readOnly}
                  type="button"
                  title={row.visible ? '隐藏' : '显示'}
                  onClick={() => {
                    if (row.type === 'object') onObjectPatch(row.id, { visible: !row.visible })
                    else onCameraPatch(row.id, { visible: !row.visible })
                  }}
                >
                  {row.visible ? <IconEye size={14} /> : <IconEyeOff size={14} />}
                </button>
                <button
                  className="grid size-7 place-items-center rounded-[6px] text-[var(--nomi-ink-45)] hover:bg-[var(--workbench-danger-soft)] hover:text-[var(--workbench-danger)] disabled:opacity-40"
                  disabled={readOnly}
                  type="button"
                  title="删除"
                  onClick={() => onDelete({ type: row.type, id: row.id })}
                >
                  <IconTrash size={14} />
                </button>
              </div>
              {isCrowd && crowdExpanded ? (
                <div className="mb-1 grid gap-0.5 pl-[22px]">
                  {Array.from({ length: rowObject ? crowdCount(rowObject) : 0 }, (_, index) => {
                    const roleIndex = (row.roleStartIndex ?? 0) + index
                    const roleColor = roleColorForIndex(roleIndex)
                    return (
                      <button
                        key={`${row.id}-member-${index}`}
                        className={cn(
                          'grid grid-cols-[24px_minmax(0,1fr)_56px] items-center gap-1 rounded-[7px] px-1 py-1',
                          'text-left text-[var(--nomi-ink-60)] hover:bg-[var(--nomi-ink-05)] hover:text-[var(--nomi-ink)]',
                          selected && 'text-[var(--nomi-ink)]',
                        )}
                        type="button"
                        title="群众成员不可单独调整"
                        onClick={() => onSelect({ type: 'object', id: row.id })}
                      >
                        <span className="grid size-6 place-items-center rounded-[6px] text-[var(--nomi-ink-45)]">
                          <IconUser size={13} />
                        </span>
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="size-2 shrink-0 rounded-full ring-1 ring-black/10"
                            style={{ backgroundColor: roleColor }}
                          />
                          <span className="min-w-0 truncate text-[12px]">{mannequinRoleLabel(roleIndex)}</span>
                        </span>
                        <span className="justify-self-end rounded-[5px] bg-[var(--nomi-ink-05)] px-1.5 py-0.5 text-[10px] text-[var(--nomi-ink-45)]">
                          只读
                        </span>
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </React.Fragment>
          )
        })}
      </div>
    </section>
  )
})

export const TrajectoryListPanel = React.memo(function TrajectoryListPanel({
  trajectories,
  groups,
  activeTrajectoryId,
  readOnly,
  onSelectTrajectory,
  onAssignTrajectoryToGroup,
  onDeleteTrajectory,
}: {
  trajectories: Scene3DTrajectory[]
  groups: Scene3DTrajectoryGroup[]
  activeTrajectoryId: string | null
  readOnly: boolean
  onSelectTrajectory: (trajectoryId: string) => void
  onAssignTrajectoryToGroup: (trajectoryId: string, groupId: string) => void
  onDeleteTrajectory: (trajectoryId: string) => void
}): JSX.Element {
  const [menu, setMenu] = React.useState<{ trajectoryId: string; x: number; y: number } | null>(null)
  const groupNameByTrajectoryId = React.useMemo(() => {
    const map = new Map<string, string>()
    groups.forEach((group) => {
      group.trajectoryIds.forEach((trajectoryId) => map.set(trajectoryId, group.name))
    })
    return map
  }, [groups])

  React.useEffect(() => {
    if (!menu) return undefined
    const close = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('[data-trajectory-list-menu="true"]')) return
      setMenu(null)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null)
    }
    window.addEventListener('pointerdown', close, true)
    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.removeEventListener('pointerdown', close, true)
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [menu])

  const activeMenuTrajectory = menu
    ? trajectories.find((trajectory) => trajectory.id === menu.trajectoryId)
    : undefined

  const menuNode = menu && activeMenuTrajectory && typeof document !== 'undefined'
    ? createPortal(
      <div
        className="fixed min-w-[132px] rounded-[8px] border border-[var(--nomi-line-soft)] bg-[var(--nomi-paper)] p-1 text-[12px] text-[var(--nomi-ink)] shadow-[0_14px_34px_rgba(18,24,38,0.2)]"
        data-trajectory-list-menu="true"
        style={{ left: menu.x, top: menu.y, zIndex: FULLSCREEN_Z_INDEX }}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="group/menu relative">
          <button
            type="button"
            disabled={readOnly || groups.length === 0}
            className="flex h-8 w-full items-center gap-2 rounded-[6px] px-2 text-left hover:bg-[var(--nomi-ink-05)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <IconFolder size={14} stroke={1.9} />
            <span className="min-w-0 flex-1 truncate">添加到组</span>
            <IconChevronRight size={13} stroke={1.9} />
          </button>
          {groups.length > 0 ? (
            <div className="absolute left-full top-0 hidden min-w-[158px] pl-2 group-hover/menu:block">
              <div className="min-w-[146px] rounded-[8px] border border-[var(--nomi-line-soft)] bg-[var(--nomi-paper)] p-1 shadow-[0_14px_34px_rgba(18,24,38,0.18)]">
                {groups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    className="flex h-8 w-full min-w-0 items-center gap-2 rounded-[6px] px-2 text-left hover:bg-[var(--nomi-ink-05)]"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      onAssignTrajectoryToGroup(activeMenuTrajectory.id, group.id)
                      setMenu(null)
                    }}
                  >
                    <IconFolder size={14} stroke={1.9} />
                    <span className="min-w-0 flex-1 truncate">{group.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          disabled={readOnly}
          className="flex h-8 w-full items-center gap-2 rounded-[6px] px-2 text-left text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-45"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onDeleteTrajectory(activeMenuTrajectory.id)
            setMenu(null)
          }}
        >
          <IconTrash size={14} stroke={1.9} />
          <span>删除</span>
        </button>
      </div>,
      document.body,
    )
    : null

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--nomi-paper)]">
      <div className="flex shrink-0 items-center justify-between px-3 py-2">
        <h3 className="m-0 text-[12px] font-medium text-[var(--nomi-ink)]">轨迹列表</h3>
        <span className="text-[11px] text-[var(--nomi-ink-60)]">{trajectories.length}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
        {trajectories.length === 0 ? (
          <div className="grid h-20 place-items-center rounded-[7px] border border-dashed border-[var(--nomi-line-soft)] text-[11px] text-[var(--nomi-ink-45)]">
            双击空白创建轨迹
          </div>
        ) : trajectories.map((trajectory) => {
          const active = trajectory.id === activeTrajectoryId
          const groupName = groupNameByTrajectoryId.get(trajectory.id)
          return (
            <div
              key={trajectory.id}
              className={cn(
                'group grid grid-cols-[18px_minmax(0,1fr)_28px] items-center gap-1 rounded-[7px] px-2 py-1.5',
                'text-[var(--nomi-ink-60)] hover:bg-[var(--nomi-ink-05)]',
                active && 'bg-[var(--nomi-ink-05)] text-[var(--nomi-ink)]',
              )}
            >
              <span className="size-2.5 rounded-full" style={{ backgroundColor: trajectory.color }} />
              <button
                type="button"
                className="grid min-w-0 gap-0.5 bg-transparent p-0 text-left text-inherit"
                onClick={() => onSelectTrajectory(trajectory.id)}
              >
                <span className="min-w-0 truncate text-[12px] font-medium">{trajectory.name}</span>
                <span className="min-w-0 truncate text-[10px] text-[var(--nomi-ink-45)]">
                  {groupName || '未分组'} · {trajectory.points.length}点
                </span>
              </button>
              <button
                type="button"
                className={cn(
                  'grid size-7 place-items-center rounded-[6px] text-[var(--nomi-ink-45)] opacity-0 hover:bg-[var(--nomi-ink-05)] hover:text-[var(--nomi-ink)] group-hover:opacity-100',
                  menu?.trajectoryId === trajectory.id && 'opacity-100',
                )}
                title="更多"
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setMenu({
                    trajectoryId: trajectory.id,
                    x: Math.min(event.clientX, window.innerWidth - 178),
                    y: Math.min(event.clientY, window.innerHeight - 98),
                  })
                }}
              >
                <IconDotsVertical size={15} stroke={1.9} />
              </button>
            </div>
          )
        })}
      </div>
      {menuNode}
    </section>
  )
})
