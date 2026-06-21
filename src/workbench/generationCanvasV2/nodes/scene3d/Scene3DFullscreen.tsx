import React from 'react'
import { createPortal } from 'react-dom'
import { Canvas } from '@react-three/fiber'
import { AnimatePresence, motion } from 'framer-motion'
import {
  IconArrowsMove,
  IconCamera,
  IconCube,
  IconListTree,
  IconPhoto,
  IconRotate,
  IconSettings,
  IconWorld,
  IconX,
} from '@tabler/icons-react'
import { toast } from '../../../../ui/toast'
import { cloneScene3DState } from './scene3dSerializer'
import {
  type Scene3DAspectRatio,
  type Scene3DCamera,
  type Scene3DCaptureResult,
  type Scene3DControlMode,
  type Scene3DGeometry,
  type Scene3DObject,
  type Scene3DSelection,
  type Scene3DState,
  type Scene3DTransformMode,
  type Scene3DTrajectory,
  type Scene3DTrajectoryBinding,
  type Scene3DTrajectoryBoundObject,
  type Scene3DTrajectoryGroup,
  type Scene3DTrajectoryPoint,
  type Scene3DVector3,
} from './scene3dTypes'
import {
  clearScene3DObjectRefs,
  resetScene3DPlayhead,
  setScene3DTrajectorySnapshot,
  setScene3DObjectRuntimeRefsVisible,
  useScene3DTrajectoryRuntimeStore,
} from './trajectory/trajectoryRuntimeStore'
import {
  CameraPreview,
  PlaybackCameraMonitor,
  SceneContent,
} from './Scene3DViewport'
import {
  CanvasPanelRestoreButton,
  PanelButton,
  PropertyPanel,
  SceneAddToolbar,
  SceneObjectList,
  TrajectoryListPanel,
} from './Scene3DPanels'
import {
  FULLSCREEN_Z_INDEX,
  OBJECT_LIMIT,
  UNGROUPED_TRAJECTORY_GROUP_ID,
  type CaptureApi,
  type CrowdAddOptions,
  type Scene3DClipboardItem,
  applyEditorCameraPose,
  cameraLookAtRotation,
  cameraWithPlaybackPosition,
  cloneCameraForClipboard,
  cloneObjectForClipboard,
  crowdCount,
  editorCameraFromSceneCamera,
  hasPlayableTrajectoryBinding,
  isEditableKeyboardTarget,
  levelEditorCameraRotation,
  makeCamera,
  makeCrowdObject,
  makeObject,
  makePastedCamera,
  makePastedObject,
  makeTrajectory,
  makeTrajectoryBinding,
  makeTrajectoryGroup,
  makeTrajectoryPoint,
  nextAvailableObjectPosition,
  trajectoryIdsForPlaybackGroup,
  trajectoryInsertTimeRatio,
  vectorAlmostEqual,
} from './scene3dShared'

const LazyTrajectoryTimeline = React.lazy(() =>
  import('./trajectory/TrajectoryTimeline').then((module) => ({
    default: module.TrajectoryTimeline,
  })),
)

type Scene3DFullscreenProps = {
  initialState: Scene3DState
  nodeTitle: string
  readOnly?: boolean
  onClose: () => void
  onStateChange: (state: Scene3DState) => void
  onScreenshot: (capture: Scene3DCaptureResult) => void
}
export default function Scene3DFullscreen({
  initialState,
  nodeTitle,
  readOnly = false,
  onClose,
  onStateChange,
  onScreenshot,
}: Scene3DFullscreenProps): JSX.Element {
  const [state, setState] = React.useState(() => cloneScene3DState(initialState))
  const [selection, setSelection] = React.useState<Scene3DSelection>(null)
  const [transformMode, setTransformMode] = React.useState<Scene3DTransformMode>('translate')
  const [viewLocked, setViewLocked] = React.useState(false)
  const controlMode: Scene3DControlMode = viewLocked ? 'edit' : 'fly'
  const controlModeRef = React.useRef<Scene3DControlMode>(controlMode)
  const [flySpeed, setFlySpeed] = React.useState(5)
  const [leftPanelOpen, setLeftPanelOpen] = React.useState(true)
  const [rightPanelOpen, setRightPanelOpen] = React.useState(true)
  const [trajectoryMode, setTrajectoryMode] = React.useState(initialState.trajectories.length > 0)
  const [trajectoryTimelineVisible, setTrajectoryTimelineVisible] = React.useState(initialState.trajectories.length > 0)
  const [activeTrajectoryId, setActiveTrajectoryId] = React.useState<string | null>(initialState.trajectories[0]?.id ?? null)
  const [activeTrajectoryPointId, setActiveTrajectoryPointId] = React.useState<string | null>(initialState.trajectories[0]?.points[0]?.id ?? null)
  const [activeTrajectoryGroupId, setActiveTrajectoryGroupId] = React.useState<string | null>(null)
  const [isTrajectoryPlaying, setIsTrajectoryPlaying] = React.useState(false)
  const trajectoryModeRef = React.useRef(trajectoryMode)
  const activeTrajectoryGroupIdRef = React.useRef<string | null>(null)
  const playheadRef = React.useRef(useScene3DTrajectoryRuntimeStore.getState().playheadSeconds ?? 0)
  const canvasFocusMode = !leftPanelOpen || !rightPanelOpen
  const [focusId, setFocusId] = React.useState('')
  const [cameraViewEditId, setCameraViewEditId] = React.useState<string | null>(null)
  const captureApiRef = React.useRef<CaptureApi | null>(null)
  const initialEditorCameraRef = React.useRef<Scene3DState['editorCamera']>({
    ...initialState.editorCamera,
    rotation: levelEditorCameraRotation(initialState.editorCamera.position, initialState.editorCamera.target),
  })
  const latestEditorCameraRef = React.useRef<Scene3DState['editorCamera']>(initialEditorCameraRef.current)
  const stateRef = React.useRef(state)
  const selectionRef = React.useRef<Scene3DSelection>(selection)
  const suspendedKeyboardSelectionRef = React.useRef<Exclude<Scene3DSelection, null> | null>(null)
  const clipboardRef = React.useRef<Scene3DClipboardItem | null>(null)
  const suppressCanvasMissedSelectionRef = React.useRef(false)
  const suppressCanvasMissedReleaseRef = React.useRef<number | null>(null)
  const onStateChangeRef = React.useRef(onStateChange)
  const canvasCamera = React.useMemo(() => ({
    fov: 55,
    near: 0.1,
    far: 500,
    position: initialEditorCameraRef.current.position,
  }), [])
  const selectedCamera = selection?.type === 'camera'
    ? state.cameras.find((camera) => camera.id === selection.id)
    : undefined
  const cameraViewEditCamera = cameraViewEditId
    ? state.cameras.find((camera) => camera.id === cameraViewEditId)
    : undefined
  const activePlaybackTrajectoryIds = React.useMemo(
    () => trajectoryIdsForPlaybackGroup(state, activeTrajectoryGroupId),
    [activeTrajectoryGroupId, state.trajectories, state.trajectoryGroups],
  )

  React.useEffect(() => {
    stateRef.current = state
  }, [state])

  React.useEffect(() => {
    setScene3DTrajectorySnapshot({
      trajectories: state.trajectories,
      trajectoryBindings: state.trajectoryBindings,
      trajectoryGroups: state.trajectoryGroups,
      sceneTimeline: state.sceneTimeline,
    })
  }, [state.sceneTimeline, state.trajectories, state.trajectoryBindings, state.trajectoryGroups])

  React.useEffect(() => {
    trajectoryModeRef.current = trajectoryMode
  }, [trajectoryMode])

  React.useEffect(() => {
    activeTrajectoryGroupIdRef.current = activeTrajectoryGroupId
  }, [activeTrajectoryGroupId])

  React.useEffect(() => {
    if (
      activeTrajectoryGroupId &&
      activeTrajectoryGroupId !== UNGROUPED_TRAJECTORY_GROUP_ID &&
      !state.trajectoryGroups.some((group) => group.id === activeTrajectoryGroupId)
    ) {
      setActiveTrajectoryGroupId(null)
      setIsTrajectoryPlaying(false)
    }
  }, [activeTrajectoryGroupId, state.trajectoryGroups])

  React.useEffect(() => {
    playheadRef.current = 0
    resetScene3DPlayhead(0)
    return () => {
      clearScene3DObjectRefs()
    }
  }, [])

  React.useEffect(() => {
    selectionRef.current = selection
  }, [selection])

  React.useEffect(() => {
    controlModeRef.current = controlMode
    latestEditorCameraRef.current = {
      ...latestEditorCameraRef.current,
      mode: controlMode,
    }
  }, [controlMode])

  React.useEffect(() => {
    onStateChangeRef.current = onStateChange
  }, [onStateChange])

  React.useEffect(() => {
    onStateChangeRef.current(state)
  }, [state])

  React.useEffect(() => () => {
    if (suppressCanvasMissedReleaseRef.current !== null) {
      window.clearTimeout(suppressCanvasMissedReleaseRef.current)
      suppressCanvasMissedReleaseRef.current = null
    }
  }, [])

  React.useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const { body } = document
    const previousOverflow = body.style.overflow
    const previousOverscroll = body.style.overscrollBehavior
    body.style.overflow = 'hidden'
    body.style.overscrollBehavior = 'none'
    return () => {
      body.style.overflow = previousOverflow
      body.style.overscrollBehavior = previousOverscroll
    }
  }, [])

  const selectSceneItem = React.useCallback((nextSelection: Scene3DSelection) => {
    setSelection(nextSelection)
    setViewLocked(false)
    setFocusId('')
  }, [])

  const clearSelection = React.useCallback(() => {
    if (suppressCanvasMissedSelectionRef.current) return
    setSelection(null)
    setViewLocked(false)
    setFocusId('')
  }, [])

  const focusSceneItem = React.useCallback((id: string) => {
    if (cameraViewEditId) return
    setViewLocked(true)
    setFocusId(`${id}:${Date.now()}`)
  }, [cameraViewEditId])

  const consumeFocusRequest = React.useCallback(() => {
    setFocusId('')
  }, [])

  const setCaptureApi = React.useCallback((api: CaptureApi | null) => {
    captureApiRef.current = api
  }, [])

  const toggleTrajectoryMode = React.useCallback(() => {
    const next = !trajectoryModeRef.current
    trajectoryModeRef.current = next
    setTrajectoryMode(next)
    if (next) {
      setTrajectoryTimelineVisible(true)
      setSelection(null)
      setViewLocked(false)
    }
  }, [])

  const patchObject = React.useCallback((id: string, patch: Partial<Scene3DObject>) => {
    setState((current) => ({
      ...current,
      objects: current.objects.map((object) => (object.id === id ? { ...object, ...patch } : object)),
    }))
  }, [])

  const patchCamera = React.useCallback((id: string, patch: Partial<Scene3DCamera>) => {
    setState((current) => ({
      ...current,
      cameras: current.cameras.map((camera) => (camera.id === id ? { ...camera, ...patch } : camera)),
    }))
  }, [])

  const restoreBindingObjectsVisible = React.useCallback((binding: Scene3DTrajectoryBinding) => {
    binding.objects.forEach((boundObject) => {
      setScene3DObjectRuntimeRefsVisible(boundObject.objectId, true)
    })
  }, [])

  const selectTrajectory = React.useCallback((trajectoryId: string) => {
    const trajectory = stateRef.current.trajectories.find((candidate) => candidate.id === trajectoryId)
    setActiveTrajectoryId(trajectoryId)
    setActiveTrajectoryPointId((current) => trajectory?.points.some((point) => point.id === current)
      ? current
      : trajectory?.points[0]?.id ?? null)
    setTrajectoryMode(true)
    setTrajectoryTimelineVisible(true)
    setSelection(null)
    setViewLocked(false)
  }, [])

  const selectTrajectoryPoint = React.useCallback((trajectoryId: string, pointId: string) => {
    selectTrajectory(trajectoryId)
    setActiveTrajectoryPointId(pointId)
  }, [selectTrajectory])

  const selectSceneTrajectory = React.useCallback((trajectoryId: string) => {
    if (trajectoryModeRef.current) {
      selectTrajectory(trajectoryId)
      return
    }
    setActiveTrajectoryId(trajectoryId)
    setActiveTrajectoryPointId(null)
    setSelection(null)
  }, [selectTrajectory])

  const addTrajectory = React.useCallback(() => {
    if (readOnly) return
    const trajectory = makeTrajectory(stateRef.current.trajectories.length)
    setState((current) => ({
      ...current,
      trajectories: [...current.trajectories, trajectory],
    }))
    setActiveTrajectoryId(trajectory.id)
    setActiveTrajectoryPointId(null)
    setTrajectoryMode(true)
    setTrajectoryTimelineVisible(true)
    setSelection(null)
    setViewLocked(false)
  }, [readOnly])

  const createTrajectoryAt = React.useCallback((position: Scene3DVector3) => {
    if (readOnly) return
    const point = makeTrajectoryPoint([position[0], position[1], position[2]])
    const trajectory = {
      ...makeTrajectory(stateRef.current.trajectories.length),
      points: [point],
    }
    setState((current) => ({
      ...current,
      trajectories: [...current.trajectories, trajectory],
    }))
    setActiveTrajectoryId(trajectory.id)
    setActiveTrajectoryPointId(null)
    setTrajectoryMode(true)
    setTrajectoryTimelineVisible(true)
    setSelection(null)
    setViewLocked(false)
  }, [readOnly])

  const patchTrajectory = React.useCallback((trajectoryId: string, patch: Partial<Scene3DTrajectory>) => {
    if (readOnly) return
    setState((current) => ({
      ...current,
      trajectories: current.trajectories.map((trajectory) => trajectory.id === trajectoryId
        ? { ...trajectory, ...patch }
        : trajectory),
    }))
  }, [readOnly])

  const addTrajectoryGroup = React.useCallback(() => {
    if (readOnly) return
    const group = makeTrajectoryGroup(stateRef.current.trajectoryGroups.length)
    setState((current) => ({
      ...current,
      trajectoryGroups: [...current.trajectoryGroups, group],
    }))
  }, [readOnly])

  const renameTrajectoryGroup = React.useCallback((groupId: string, name: string) => {
    if (readOnly) return
    const nextName = name.trim() || '未命名组'
    setState((current) => ({
      ...current,
      trajectoryGroups: current.trajectoryGroups.map((group) => group.id === groupId
        ? { ...group, name: nextName }
        : group),
    }))
  }, [readOnly])

  const assignTrajectoryToGroup = React.useCallback((trajectoryId: string, groupId: string) => {
    if (readOnly) return
    const groupExists = stateRef.current.trajectoryGroups.some((group) => group.id === groupId)
    const trajectoryExists = stateRef.current.trajectories.some((trajectory) => trajectory.id === trajectoryId)
    if (!groupExists || !trajectoryExists) return
    setState((current) => ({
      ...current,
      trajectoryGroups: current.trajectoryGroups.map((group) => {
        const withoutTrajectory = group.trajectoryIds.filter((id) => id !== trajectoryId)
        if (group.id !== groupId) return { ...group, trajectoryIds: withoutTrajectory }
        return {
          ...group,
          trajectoryIds: withoutTrajectory.includes(trajectoryId)
            ? withoutTrajectory
            : [...withoutTrajectory, trajectoryId],
        }
      }),
    }))
  }, [readOnly])

  const deleteTrajectory = React.useCallback((trajectoryId: string) => {
    if (readOnly) return
    const nextActiveTrajectoryId = stateRef.current.trajectories.find((trajectory) => trajectory.id !== trajectoryId)?.id ?? null
    setState((current) => {
      current.trajectoryBindings
        .filter((binding) => binding.trajectoryId === trajectoryId)
        .forEach(restoreBindingObjectsVisible)
      const nextTrajectories = current.trajectories.filter((trajectory) => trajectory.id !== trajectoryId)
      return {
        ...current,
        trajectories: nextTrajectories,
        trajectoryBindings: current.trajectoryBindings.filter((binding) => binding.trajectoryId !== trajectoryId),
        trajectoryGroups: current.trajectoryGroups.map((group) => ({
          ...group,
          trajectoryIds: group.trajectoryIds.filter((id) => id !== trajectoryId),
        })),
      }
    })
    setActiveTrajectoryId((current) => current === trajectoryId ? nextActiveTrajectoryId : current)
    setActiveTrajectoryPointId(null)
  }, [readOnly, restoreBindingObjectsVisible])

  const addTrajectoryPoint = React.useCallback((trajectoryId: string) => {
    if (readOnly) return
    const trajectory = stateRef.current.trajectories.find((candidate) => candidate.id === trajectoryId)
    if (!trajectory) return
    if (trajectory.points.length === 0) {
      const point = makeTrajectoryPoint([0, 0, 0])
      setState((current) => ({
        ...current,
        trajectories: current.trajectories.map((candidate) => candidate.id === trajectoryId
          ? { ...candidate, points: [point] }
          : candidate),
      }))
      setActiveTrajectoryId(trajectoryId)
      setActiveTrajectoryPointId(point.id)
      return
    }
    const activeIndex = activeTrajectoryId === trajectoryId && activeTrajectoryPointId
      ? trajectory.points.findIndex((point) => point.id === activeTrajectoryPointId)
      : -1
    const sourceIndex = activeIndex >= 0 ? activeIndex : trajectory.points.length - 1
    const source = trajectory.points[sourceIndex]?.position ?? [0, 0, 0]
    const previous = trajectory.points[sourceIndex - 1]?.position ?? [source[0] - 1, source[1], source[2] - 1]
    const nextPosition: Scene3DVector3 = [
      Number((source[0] + (source[0] - previous[0] || 1)).toFixed(4)),
      source[1],
      Number((source[2] + (source[2] - previous[2] || 1)).toFixed(4)),
    ]
    const point = makeTrajectoryPoint(nextPosition, trajectoryInsertTimeRatio(trajectory, sourceIndex + 1))
    setState((current) => ({
      ...current,
      trajectories: current.trajectories.map((candidate) => candidate.id === trajectoryId
        ? {
            ...candidate,
            points: [
              ...candidate.points.slice(0, sourceIndex + 1),
              point,
              ...candidate.points.slice(sourceIndex + 1),
            ],
            curveControls: candidate.curveControls?.filter((control) => (
              control.segmentStartPointId !== candidate.points[sourceIndex]?.id
            )),
          }
        : candidate),
    }))
    setActiveTrajectoryId(trajectoryId)
    setActiveTrajectoryPointId(point.id)
  }, [activeTrajectoryId, activeTrajectoryPointId, readOnly])

  const insertTrajectoryPoint = React.useCallback((
    trajectoryId: string,
    position: Scene3DVector3,
    targetPointId?: string | null,
    placement: 'before' | 'after' = 'after',
  ) => {
    if (readOnly) return
    const trajectory = stateRef.current.trajectories.find((candidate) => candidate.id === trajectoryId)
    if (!trajectory) return
    const referenceIndex = targetPointId
      ? trajectory.points.findIndex((candidate) => candidate.id === targetPointId)
      : -1
    const insertIndex = referenceIndex >= 0
      ? placement === 'before' ? referenceIndex : referenceIndex + 1
      : trajectory.points.length
    const point = makeTrajectoryPoint(position, trajectoryInsertTimeRatio(trajectory, insertIndex))
    const affectedCurveControlStartId = referenceIndex >= 0
      ? placement === 'before'
        ? trajectory.points[referenceIndex - 1]?.id
        : trajectory.points[referenceIndex]?.id
      : null
    setState((current) => ({
      ...current,
      trajectories: current.trajectories.map((candidate) => candidate.id === trajectoryId
        ? {
            ...candidate,
            points: [
              ...candidate.points.slice(0, insertIndex),
              point,
              ...candidate.points.slice(insertIndex),
            ],
            curveControls: affectedCurveControlStartId
              ? candidate.curveControls?.filter((control) => control.segmentStartPointId !== affectedCurveControlStartId)
              : candidate.curveControls,
          }
        : candidate),
    }))
    selectTrajectory(trajectoryId)
    setActiveTrajectoryPointId(point.id)
  }, [readOnly, selectTrajectory])

  const updateTrajectoryCurveControl = React.useCallback((trajectoryId: string, segmentStartPointId: string, position: Scene3DVector3 | null) => {
    if (readOnly) return
    setState((current) => ({
      ...current,
      trajectories: current.trajectories.map((trajectory) => {
        if (trajectory.id !== trajectoryId) return trajectory
        const segmentStartIndex = trajectory.points.findIndex((point) => point.id === segmentStartPointId)
        if (
          segmentStartIndex < 0 ||
          (!trajectory.closed && segmentStartIndex >= trajectory.points.length - 1)
        ) {
          return trajectory
        }
        const controls = trajectory.curveControls?.filter((control) => control.segmentStartPointId !== segmentStartPointId) ?? []
        return {
          ...trajectory,
          curveControls: position ? [...controls, { segmentStartPointId, position }] : controls,
        }
      }),
    }))
    setActiveTrajectoryId(trajectoryId)
    setTrajectoryMode(true)
    setTrajectoryTimelineVisible(true)
  }, [readOnly])

  const updateTrajectoryPoint = React.useCallback((trajectoryId: string, pointId: string, position: Scene3DVector3) => {
    if (readOnly) return
    setState((current) => {
      let changed = false
      const trajectories = current.trajectories.map((trajectory) => {
        if (trajectory.id !== trajectoryId) return trajectory
        const points = trajectory.points.map((point) => {
          if (point.id !== pointId) return point
          if (vectorAlmostEqual(point.position, position, 0.0001)) return point
          changed = true
          return { ...point, position }
        })
        return changed ? { ...trajectory, points } : trajectory
      })
      return changed ? { ...current, trajectories } : current
    })
  }, [readOnly])

  const patchTrajectoryPoint = React.useCallback((trajectoryId: string, pointId: string, patch: Partial<Scene3DTrajectoryPoint>) => {
    if (readOnly) return
    setState((current) => {
      let changed = false
      const trajectories = current.trajectories.map((trajectory) => {
        if (trajectory.id !== trajectoryId) return trajectory
        const points = trajectory.points.map((point) => {
          if (point.id !== pointId) return point
          const nextPoint = { ...point, ...patch }
          if (
            nextPoint.position === point.position &&
            nextPoint.timeRatio === point.timeRatio
          ) {
            return point
          }
          changed = true
          return nextPoint
        })
        return changed ? { ...trajectory, points } : trajectory
      })
      return changed ? { ...current, trajectories } : current
    })
  }, [readOnly])

  const translateTrajectory = React.useCallback((trajectoryId: string, delta: Scene3DVector3) => {
    if (
      readOnly ||
      (Math.abs(delta[0]) <= 0.0001 && Math.abs(delta[1]) <= 0.0001 && Math.abs(delta[2]) <= 0.0001)
    ) {
      return
    }
    setState((current) => {
      let changed = false
      const trajectories = current.trajectories.map((trajectory) => {
        if (trajectory.id !== trajectoryId || trajectory.points.length === 0) return trajectory
        changed = true
        return {
          ...trajectory,
          points: trajectory.points.map((point) => ({
            ...point,
            position: [
              Number((point.position[0] + delta[0]).toFixed(4)),
              Number((point.position[1] + delta[1]).toFixed(4)),
              Number((point.position[2] + delta[2]).toFixed(4)),
            ] satisfies Scene3DVector3,
          })),
          curveControls: trajectory.curveControls?.map((control) => ({
            ...control,
            position: [
              Number((control.position[0] + delta[0]).toFixed(4)),
              Number((control.position[1] + delta[1]).toFixed(4)),
              Number((control.position[2] + delta[2]).toFixed(4)),
            ] satisfies Scene3DVector3,
          })),
        }
      })
      return changed ? { ...current, trajectories } : current
    })
  }, [readOnly])

  const deleteTrajectoryPoint = React.useCallback((trajectoryId: string, pointId: string) => {
    if (readOnly) return
    const trajectory = stateRef.current.trajectories.find((candidate) => candidate.id === trajectoryId)
    const pointIndex = trajectory?.points.findIndex((point) => point.id === pointId) ?? -1
    if (!trajectory || pointIndex < 0) return
    const nextActivePointId = trajectory.points[pointIndex + 1]?.id ?? trajectory.points[pointIndex - 1]?.id ?? null
    setState((current) => ({
      ...current,
      trajectories: current.trajectories.map((trajectory) => {
        if (trajectory.id !== trajectoryId) return trajectory
        const points = trajectory.points.filter((point) => point.id !== pointId)
        const validSegmentStartIds = new Set(points.slice(0, trajectory.closed ? points.length : Math.max(0, points.length - 1)).map((point) => point.id))
        return {
          ...trajectory,
          points,
          curveControls: trajectory.curveControls?.filter((control) => validSegmentStartIds.has(control.segmentStartPointId)),
        }
      }),
    }))
    setActiveTrajectoryPointId((current) => current === pointId ? nextActivePointId : current)
  }, [readOnly])

  const patchTrajectoryBinding = React.useCallback((bindingId: string, patch: Partial<Scene3DTrajectoryBinding>) => {
    if (readOnly) return
    setState((current) => {
      let nextMaxEndTime = current.sceneTimeline.totalDuration
      const trajectoryBindings = current.trajectoryBindings.map((binding) => {
        if (binding.id !== bindingId) return binding
        const next = { ...binding, ...patch }
        if (next.endTime <= next.startTime) next.endTime = next.startTime + 0.001
        nextMaxEndTime = Math.max(nextMaxEndTime, next.endTime)
        return next
      })
      return {
        ...current,
        trajectoryBindings,
        sceneTimeline: nextMaxEndTime === current.sceneTimeline.totalDuration
          ? current.sceneTimeline
          : { ...current.sceneTimeline, totalDuration: nextMaxEndTime },
      }
    })
  }, [readOnly])

  const bindObjectToTrajectory = React.useCallback((trajectoryId: string, objectId: string) => {
    if (readOnly) return
    const objectExists = stateRef.current.objects.some((object) => object.id === objectId)
    const cameraExists = stateRef.current.cameras.some((camera) => camera.id === objectId)
    const targetExists = objectExists || cameraExists
    if (!targetExists) return
    const alreadyBound = stateRef.current.trajectoryBindings.some((binding) => (
      binding.objects.some((boundObject) => boundObject.objectId === objectId)
    ))
    if (alreadyBound) {
      toast('同一节点只能绑定一条轨迹', 'warning')
      return
    }
    setState((current) => {
      const binding = current.trajectoryBindings.find((candidate) => candidate.trajectoryId === trajectoryId)
      if (!binding) {
        const nextBinding = makeTrajectoryBinding(trajectoryId, objectId)
        return {
          ...current,
          trajectoryBindings: [...current.trajectoryBindings, nextBinding],
          sceneTimeline: nextBinding.endTime > current.sceneTimeline.totalDuration
            ? { ...current.sceneTimeline, totalDuration: nextBinding.endTime }
            : current.sceneTimeline,
        }
      }
      return {
        ...current,
        trajectoryBindings: current.trajectoryBindings.map((candidate) => candidate.id === binding.id
          ? {
              ...candidate,
              objects: [...candidate.objects, { objectId, offsetRatio: 0 }],
            }
          : candidate),
      }
    })
    setSelection(cameraExists ? { type: 'camera', id: objectId } : { type: 'object', id: objectId })
    setTrajectoryTimelineVisible(true)
  }, [readOnly])

  const patchBoundObject = React.useCallback((bindingId: string, objectId: string, patch: Partial<Scene3DTrajectoryBoundObject>) => {
    if (readOnly) return
    setState((current) => ({
      ...current,
      trajectoryBindings: current.trajectoryBindings.map((binding) => binding.id === bindingId
        ? {
            ...binding,
            objects: binding.objects.map((boundObject) => boundObject.objectId === objectId
              ? { ...boundObject, ...patch }
              : boundObject),
          }
        : binding),
    }))
  }, [readOnly])

  const unbindObject = React.useCallback((bindingId: string, objectId: string) => {
    if (readOnly) return
    setState((current) => ({
      ...current,
      trajectoryBindings: current.trajectoryBindings.map((binding) => {
        if (binding.id !== bindingId) return binding
        setScene3DObjectRuntimeRefsVisible(objectId, true)
        return {
          ...binding,
          objects: binding.objects.filter((boundObject) => boundObject.objectId !== objectId),
        }
      }),
    }))
  }, [readOnly])

  const deleteTrajectoryBinding = React.useCallback((bindingId: string) => {
    if (readOnly) return
    setState((current) => {
      const binding = current.trajectoryBindings.find((candidate) => candidate.id === bindingId)
      if (binding) restoreBindingObjectsVisible(binding)
      return {
        ...current,
        trajectoryBindings: current.trajectoryBindings.filter((candidate) => candidate.id !== bindingId),
      }
    })
  }, [readOnly, restoreBindingObjectsVisible])

  const deleteSceneItem = React.useCallback((target: Exclude<Scene3DSelection, null>) => {
    if (readOnly) return
    setState((current) => target.type === 'object'
      ? {
          ...current,
          objects: current.objects.filter((object) => object.id !== target.id),
          cameras: current.cameras.map((camera) => (
            camera.followTargetId === target.id ? { ...camera, followTargetId: undefined } : camera
          )),
          trajectoryBindings: current.trajectoryBindings.map((binding) => {
            const hadObject = binding.objects.some((boundObject) => boundObject.objectId === target.id)
            if (!hadObject) return binding
            setScene3DObjectRuntimeRefsVisible(target.id, true)
            return {
              ...binding,
              objects: binding.objects.filter((boundObject) => boundObject.objectId !== target.id),
            }
          }),
        }
      : {
          ...current,
          cameras: current.cameras.filter((camera) => camera.id !== target.id),
          trajectoryBindings: current.trajectoryBindings.map((binding) => {
            const hadObject = binding.objects.some((boundObject) => boundObject.objectId === target.id)
            if (!hadObject) return binding
            setScene3DObjectRuntimeRefsVisible(target.id, true)
            return {
              ...binding,
              objects: binding.objects.filter((boundObject) => boundObject.objectId !== target.id),
            }
          }),
        })
    if (selectionRef.current?.type === target.type && selectionRef.current.id === target.id) {
      setViewLocked(false)
    }
    if (target.type === 'camera') {
      setCameraViewEditId((current) => (current === target.id ? null : current))
    }
    setSelection((current) => (current?.type === target.type && current.id === target.id ? null : current))
  }, [readOnly])

  const addObject = React.useCallback((kind: Scene3DGeometry | 'mannequin' | 'light') => {
    if (readOnly) return
    if (state.objects.length >= OBJECT_LIMIT) {
      toast('单个 3D 场景最多支持 100 个对象', 'warning')
      return
    }
    const roleIndex = kind === 'mannequin'
      ? stateRef.current.objects.reduce((count, object) => {
        if (object.type === 'mannequin') return count + 1
        if (object.type === 'mannequinCrowd') return count + crowdCount(object)
        return count
      }, 0)
      : 0
    const object = makeObject(kind, roleIndex)
    if (object.type === 'mannequin') {
      object.position = nextAvailableObjectPosition(object, stateRef.current.objects)
    }
    setState((current) => ({ ...current, objects: [...current.objects, object] }))
    setSelection({ type: 'object', id: object.id })
    setViewLocked(false)
  }, [readOnly, state.objects.length])

  const addCamera = React.useCallback(() => {
    if (readOnly) return
    const camera = makeCamera(state.cameras.length)
    setState((current) => ({ ...current, cameras: [...current.cameras, camera] }))
    setSelection({ type: 'camera', id: camera.id })
    setViewLocked(false)
  }, [readOnly, state.cameras.length])

  const addCrowd = React.useCallback((options: CrowdAddOptions) => {
    if (readOnly) return
    if (state.objects.length >= OBJECT_LIMIT) {
      toast('单个 3D 场景最多支持 100 个对象', 'warning')
      return
    }
    const crowd = makeCrowdObject(options)
    crowd.position = nextAvailableObjectPosition(crowd, stateRef.current.objects)
    setState((current) => ({ ...current, objects: [...current.objects, crowd] }))
    setSelection({ type: 'object', id: crowd.id })
    setViewLocked(false)
  }, [readOnly, state.objects.length])

  const startKeyboardNavigation = React.useCallback(() => {
    const currentSelection = selectionRef.current
    setViewLocked(false)
    setFocusId('')
    if (!currentSelection) return
    if (!suspendedKeyboardSelectionRef.current) {
      suspendedKeyboardSelectionRef.current = currentSelection
    }
    setSelection(null)
  }, [])

  const stopKeyboardNavigation = React.useCallback(() => {
    const suspendedSelection = suspendedKeyboardSelectionRef.current
    if (!suspendedSelection) return
    suspendedKeyboardSelectionRef.current = null

    const currentState = stateRef.current
    const stillExists = suspendedSelection.type === 'object'
      ? currentState.objects.some((object) => object.id === suspendedSelection.id)
      : currentState.cameras.some((camera) => camera.id === suspendedSelection.id)
    setSelection(stillExists ? suspendedSelection : null)
  }, [])

  const copySelection = React.useCallback(() => {
    const currentSelection = selectionRef.current
    if (!currentSelection) return false

    if (currentSelection.type === 'object') {
      const object = stateRef.current.objects.find((candidate) => candidate.id === currentSelection.id)
      if (!object) return false
      clipboardRef.current = {
        type: 'object',
        item: cloneObjectForClipboard(object),
        pasteCount: 0,
      }
      toast('已复制 3D 节点', 'success')
      return true
    }

    const camera = stateRef.current.cameras.find((candidate) => candidate.id === currentSelection.id)
    if (!camera) return false
    clipboardRef.current = {
      type: 'camera',
      item: cloneCameraForClipboard(camera),
      pasteCount: 0,
    }
    toast('已复制相机节点', 'success')
    return true
  }, [])

  const pasteClipboard = React.useCallback(() => {
    if (readOnly) return false
    const clipboard = clipboardRef.current
    if (!clipboard) return false
    const pasteCount = clipboard.pasteCount + 1

    if (clipboard.type === 'object') {
      const current = stateRef.current
      if (current.objects.length >= OBJECT_LIMIT) {
        toast('单个 3D 场景最多支持 100 个对象', 'warning')
        return true
      }
      const object = makePastedObject(clipboard.item, pasteCount)
      const nextState = {
        ...current,
        objects: [...current.objects, object],
      }
      clipboardRef.current = { ...clipboard, pasteCount }
      stateRef.current = nextState
      setState(nextState)
      setSelection({ type: 'object', id: object.id })
      setViewLocked(false)
      toast('已粘贴 3D 节点', 'success')
      return true
    }

    const current = stateRef.current
    const camera = makePastedCamera(clipboard.item, pasteCount)
    const nextState = {
      ...current,
      cameras: [...current.cameras, camera],
    }
    clipboardRef.current = { ...clipboard, pasteCount }
    stateRef.current = nextState
    setState(nextState)
    setSelection({ type: 'camera', id: camera.id })
    setViewLocked(false)
    toast('已粘贴相机节点', 'success')
    return true
  }, [readOnly])

  const captureViewport = React.useCallback(() => {
    const capture = captureApiRef.current?.captureViewport()
    if (!capture) {
      toast('截图失败，请重试', 'error')
      return
    }
    onScreenshot(capture)
  }, [onScreenshot])

  const captureSelectedCamera = React.useCallback(() => {
    if (!selectedCamera) {
      toast('请先选中一个拍摄相机', 'warning')
      return
    }
    const currentState = stateRef.current
    const activeIds = trajectoryIdsForPlaybackGroup(currentState, activeTrajectoryGroupIdRef.current)
    const captureCamera = cameraWithPlaybackPosition(currentState, selectedCamera, playheadRef.current, activeIds)
    const capture = captureApiRef.current?.captureCamera(captureCamera)
    if (!capture) {
      toast('相机截图失败，请重试', 'error')
      return
    }
    onScreenshot(capture)
  }, [onScreenshot, selectedCamera])

  const updateEditorCamera = React.useCallback((editorCamera: Scene3DState['editorCamera']) => {
    setState((current) => {
      const nextEditorCamera = {
        ...current.editorCamera,
        ...editorCamera,
      }
      if (
        current.editorCamera.mode === nextEditorCamera.mode &&
        vectorAlmostEqual(current.editorCamera.position, nextEditorCamera.position) &&
        vectorAlmostEqual(current.editorCamera.rotation, nextEditorCamera.rotation) &&
        vectorAlmostEqual(current.editorCamera.target, nextEditorCamera.target)
      ) {
        return current
      }
      return {
        ...current,
        editorCamera: nextEditorCamera,
      }
    })
  }, [])

  const updateEditorCameraTarget = React.useCallback((target: Scene3DVector3) => {
    latestEditorCameraRef.current = {
      ...latestEditorCameraRef.current,
      target,
    }
    setState((current) => vectorAlmostEqual(current.editorCamera.target, target)
      ? current
      : {
          ...current,
          editorCamera: {
            ...current.editorCamera,
            target,
          },
        })
  }, [])

  const handleWheelNavigation = React.useCallback((editorCamera: Scene3DState['editorCamera']) => {
    latestEditorCameraRef.current = editorCamera
    setViewLocked(false)
    setFocusId('')
    updateEditorCamera(editorCamera)
  }, [updateEditorCamera])

  const unlockViewForSceneEdit = React.useCallback(() => {
    suppressCanvasMissedSelectionRef.current = true
    if (suppressCanvasMissedReleaseRef.current !== null) {
      window.clearTimeout(suppressCanvasMissedReleaseRef.current)
      suppressCanvasMissedReleaseRef.current = null
    }
    setViewLocked(false)
    setFocusId('')
  }, [])

  const finishSceneTransformInteraction = React.useCallback(() => {
    if (suppressCanvasMissedReleaseRef.current !== null) {
      window.clearTimeout(suppressCanvasMissedReleaseRef.current)
    }
    suppressCanvasMissedReleaseRef.current = window.setTimeout(() => {
      suppressCanvasMissedSelectionRef.current = false
      suppressCanvasMissedReleaseRef.current = null
    }, 160)
  }, [])

  const handleEditorCameraDraft = React.useCallback((editorCamera: Scene3DState['editorCamera']) => {
    latestEditorCameraRef.current = editorCamera
  }, [])

  React.useEffect(() => {
    if (cameraViewEditId && !cameraViewEditCamera) {
      setCameraViewEditId(null)
    }
  }, [cameraViewEditCamera, cameraViewEditId])

  const enterCameraViewEdit = React.useCallback((cameraData: Scene3DCamera) => {
    if (readOnly) return
    const editorCamera = editorCameraFromSceneCamera(cameraData)
    latestEditorCameraRef.current = editorCamera
    setSelection({ type: 'camera', id: cameraData.id })
    setCameraViewEditId(cameraData.id)
    setViewLocked(false)
    setFocusId('')
    updateEditorCamera(editorCamera)
  }, [readOnly, updateEditorCamera])

  const exitCameraViewEdit = React.useCallback(() => {
    setCameraViewEditId(null)
    setViewLocked(false)
    setFocusId('')
  }, [])

  const toggleCameraViewEdit = React.useCallback(() => {
    if (!selectedCamera || readOnly) return
    if (cameraViewEditId === selectedCamera.id) {
      return
    }
    const currentState = stateRef.current
    const activeIds = trajectoryIdsForPlaybackGroup(currentState, activeTrajectoryGroupIdRef.current)
    enterCameraViewEdit(cameraWithPlaybackPosition(currentState, selectedCamera, playheadRef.current, activeIds))
  }, [cameraViewEditId, enterCameraViewEdit, readOnly, selectedCamera])

  const levelSelectedCamera = React.useCallback(() => {
    if (!selectedCamera || readOnly) return
    const currentState = stateRef.current
    const activeIds = trajectoryIdsForPlaybackGroup(currentState, activeTrajectoryGroupIdRef.current)
    const displayCamera = cameraWithPlaybackPosition(currentState, selectedCamera, playheadRef.current, activeIds)
    patchCamera(selectedCamera.id, {
      rotation: cameraLookAtRotation(displayCamera.position, displayCamera.target),
    })
  }, [patchCamera, readOnly, selectedCamera])

  const changeSelectedCameraAspect = React.useCallback((aspectRatio: Scene3DAspectRatio) => {
    const cameraId = selectionRef.current?.type === 'camera' ? selectionRef.current.id : ''
    if (!cameraId) return
    patchCamera(cameraId, { aspectRatio })
  }, [patchCamera])

  const changeSelectedCameraLensDepth = React.useCallback((lensDepth: number) => {
    const cameraId = selectionRef.current?.type === 'camera' ? selectionRef.current.id : ''
    if (!cameraId) return
    patchCamera(cameraId, { lensDepth })
  }, [patchCamera])

  const flushLatestState = React.useCallback(() => {
    const latestState = {
      ...stateRef.current,
      editorCamera: {
        ...latestEditorCameraRef.current,
        mode: controlModeRef.current,
      },
    }
    stateRef.current = latestState
    onStateChangeRef.current(latestState)
    return latestState
  }, [])

  const handleClose = React.useCallback(() => {
    flushLatestState()
    onClose()
  }, [flushLatestState, onClose])

  const patchEnvironment = React.useCallback((patch: Partial<Scene3DState['environment']>) => {
    setState((current) => ({
      ...current,
      environment: { ...current.environment, ...patch },
    }))
  }, [])

  const handleTrajectoryPlayChange = React.useCallback((playing: boolean) => {
    if (playing) {
      const activeIds = trajectoryIdsForPlaybackGroup(stateRef.current, activeTrajectoryGroupIdRef.current)
      if (!hasPlayableTrajectoryBinding(stateRef.current, activeIds)) {
        toast(activeIds ? '当前分组没有可播放的绑定轨迹' : '请先绑定一个节点到轨迹', 'warning')
        return
      }
    }
    setIsTrajectoryPlaying(playing)
  }, [])

  const selectTrajectoryPlaybackGroup = React.useCallback((groupId: string | null) => {
    if (activeTrajectoryGroupIdRef.current !== groupId) {
      setIsTrajectoryPlaying(false)
      activeTrajectoryGroupIdRef.current = groupId
      setActiveTrajectoryGroupId(groupId)
      return
    }
    setActiveTrajectoryGroupId(groupId)
  }, [])

  const closeTrajectoryTimeline = React.useCallback(() => {
    setTrajectoryTimelineVisible(false)
  }, [])

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const shortcutKey = event.key.toLowerCase()
      const isModifierShortcut = event.ctrlKey || event.metaKey
      if (
        shortcutKey === 'r' &&
        !event.repeat &&
        !isModifierShortcut &&
        !event.altKey &&
        !isEditableKeyboardTarget(event.target)
      ) {
        event.preventDefault()
        event.stopPropagation()
        setTransformMode((mode) => (mode === 'rotate' ? 'translate' : 'rotate'))
        return
      }
      if (isModifierShortcut && !event.altKey && !isEditableKeyboardTarget(event.target)) {
        if (shortcutKey === 'c' && copySelection()) {
          event.preventDefault()
          event.stopPropagation()
          return
        }
        if (shortcutKey === 'v' && pasteClipboard()) {
          event.preventDefault()
          event.stopPropagation()
          return
        }
      }
      if (event.key === 'Delete' && !isEditableKeyboardTarget(event.target)) {
        const currentSelection = selectionRef.current
        if (currentSelection) {
          event.preventDefault()
          event.stopPropagation()
          deleteSceneItem(currentSelection)
          return
        }
      }
      if (event.key === 'Escape' && !document.pointerLockElement) {
        if (cameraViewEditId) {
          event.preventDefault()
          event.stopPropagation()
          exitCameraViewEdit()
          return
        }
        handleClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [cameraViewEditId, copySelection, deleteSceneItem, exitCameraViewEdit, handleClose, pasteClipboard])

  React.useEffect(() => () => {
    flushLatestState()
  }, [flushLatestState])

  const toggleCanvasFocusMode = React.useCallback(() => {
    if (leftPanelOpen && rightPanelOpen) {
      setLeftPanelOpen(false)
      setRightPanelOpen(false)
      return
    }
    setLeftPanelOpen(true)
    setRightPanelOpen(true)
  }, [leftPanelOpen, rightPanelOpen])

  const editorShell = (
    <div
      className="workbench-shell fixed inset-0 isolate flex h-[100dvh] w-screen flex-col overflow-hidden bg-[var(--workbench-bg)] text-[var(--workbench-ink)] font-[var(--nomi-font-sans)]"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100dvh',
        minWidth: '100vw',
        minHeight: '100dvh',
        zIndex: FULLSCREEN_Z_INDEX,
        background: 'var(--workbench-bg)',
        pointerEvents: 'auto',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="3D 场景编辑器"
      tabIndex={0}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <header className="relative z-[2] flex min-h-[52px] shrink-0 items-center gap-3 border-b border-[var(--workbench-border)] bg-[var(--workbench-surface-solid)] px-4 shadow-[0_1px_0_rgba(18,24,38,0.04)]">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <IconCube size={18} className="shrink-0 text-[var(--workbench-muted)]" />
          <div className="min-w-0 truncate text-[13px] font-medium text-[var(--workbench-ink)]">{nodeTitle}</div>
        </div>
        <div className="ml-auto flex min-w-0 max-w-[72vw] items-center gap-2 overflow-x-auto">
          <div className="flex items-center gap-1 rounded-[8px] border border-[var(--nomi-line-soft)] bg-[var(--nomi-paper)] p-0.5">
            <PanelButton title="移动" active={transformMode === 'translate'} onClick={() => setTransformMode('translate')}>
              <IconArrowsMove size={15} />
            </PanelButton>
            <PanelButton title="旋转" active={transformMode === 'rotate'} onClick={() => setTransformMode('rotate')}>
              <IconRotate size={15} />
            </PanelButton>
            <PanelButton
              title={trajectoryMode ? '退出轨迹模式' : '轨迹模式'}
              active={trajectoryMode}
              onClick={toggleTrajectoryMode}
            >
              <IconArrowsMove size={15} />
            </PanelButton>
          </div>
          <div className="flex items-center gap-1 rounded-[8px] border border-[var(--nomi-line-soft)] bg-[var(--nomi-paper)] p-0.5">
            <PanelButton title="当前视口截图" onClick={captureViewport}>
              <IconPhoto size={15} />
              <span>截图</span>
            </PanelButton>
          </div>
          <label className="inline-flex h-8 shrink-0 items-center gap-2 rounded-[8px] border border-[var(--nomi-line-soft)] bg-[var(--nomi-paper)] px-2 text-[12px] text-[var(--workbench-muted)]">
            <IconWorld size={14} />
            <span>速度</span>
            <input
              className="h-1.5 w-24 accent-[var(--nomi-ink)]"
              max={16}
              min={1}
              step={0.5}
              type="range"
              value={flySpeed}
              onChange={(event) => setFlySpeed(Number(event.currentTarget.value))}
            />
          </label>
          <button
            className="grid size-8 shrink-0 place-items-center rounded-[7px] border border-[var(--nomi-line-soft)] bg-[var(--nomi-ink-05)] text-[var(--nomi-ink-60)] hover:bg-[var(--nomi-ink-10)] hover:text-[var(--nomi-ink)]"
            type="button"
            title="关闭"
            onClick={handleClose}
          >
            <IconX size={16} />
          </button>
        </div>
      </header>

      <main className="relative flex min-h-0 flex-1 overflow-hidden bg-[var(--workbench-bg)]">
        <AnimatePresence initial={false}>
          {leftPanelOpen ? (
            <motion.aside
              key="scene-node-panel"
              animate={{ opacity: 1, scale: 1, width: 260, x: 0 }}
              className="relative z-[2] flex min-h-0 shrink-0 flex-col overflow-hidden border-r border-[var(--workbench-border)] bg-[var(--workbench-surface-solid)] shadow-[8px_0_28px_rgba(18,24,38,0.05)]"
              exit={{ opacity: 0, scale: 0.16, width: 0, x: -26 }}
              initial={{ opacity: 0, scale: 0.16, width: 0, x: -26 }}
              style={{ transformOrigin: 'top left' }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            >
              {trajectoryMode ? (
                <TrajectoryListPanel
                  trajectories={state.trajectories}
                  groups={state.trajectoryGroups}
                  activeTrajectoryId={activeTrajectoryId}
                  readOnly={readOnly}
                  onSelectTrajectory={selectTrajectory}
                  onAssignTrajectoryToGroup={assignTrajectoryToGroup}
                  onDeleteTrajectory={deleteTrajectory}
                />
              ) : (
                <SceneObjectList
                  objects={state.objects}
                  cameras={state.cameras}
                  selection={selection}
                  readOnly={readOnly}
                  onSelect={selectSceneItem}
                  onFocus={focusSceneItem}
                  onObjectPatch={patchObject}
                  onCameraPatch={patchCamera}
                  onDelete={deleteSceneItem}
                />
              )}
            </motion.aside>
          ) : null}
        </AnimatePresence>

        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-[var(--nomi-ink-05)]">
          <Canvas
            camera={canvasCamera}
            dpr={[1, 2]}
            gl={{ antialias: true, preserveDrawingBuffer: false }}
            onCreated={({ camera }) => applyEditorCameraPose(camera, initialEditorCameraRef.current)}
            onPointerMissed={clearSelection}
          >
            <SceneContent
              state={state}
              selection={selection}
              readOnly={readOnly}
              transformMode={trajectoryMode ? 'translate' : transformMode}
              flySpeed={flySpeed}
              focusId={focusId}
              viewLocked={viewLocked}
              cameraViewEditCamera={cameraViewEditCamera}
              trajectoryMode={trajectoryMode}
              activeTrajectoryId={activeTrajectoryId}
              activeTrajectoryPointId={activeTrajectoryPointId}
              activePlaybackTrajectoryIds={activePlaybackTrajectoryIds}
              playheadRef={playheadRef}
              isTrajectoryPlaying={isTrajectoryPlaying}
              setIsTrajectoryPlaying={setIsTrajectoryPlaying}
              onSelect={selectSceneItem}
              onFocus={focusSceneItem}
              onObjectPatch={patchObject}
              onCameraPatch={patchCamera}
              onTrajectorySelect={selectSceneTrajectory}
              onTrajectoryPointSelect={selectTrajectoryPoint}
              onTrajectoryCreateAt={createTrajectoryAt}
              onTrajectoryPointInsert={insertTrajectoryPoint}
              onTrajectoryCurveControlUpdate={updateTrajectoryCurveControl}
              onTrajectoryPointUpdate={updateTrajectoryPoint}
              onTrajectoryMove={translateTrajectory}
              onTrajectoryEdit={selectTrajectory}
              onTrajectoryDelete={deleteTrajectory}
              onBindTargetToTrajectory={bindObjectToTrajectory}
              onEditorCameraDraft={handleEditorCameraDraft}
              onEditorCameraCommit={updateEditorCamera}
              onEditorCameraTargetChange={updateEditorCameraTarget}
              onWheelNavigation={handleWheelNavigation}
              onTransformInteractionStart={unlockViewForSceneEdit}
              onTransformInteractionEnd={finishSceneTransformInteraction}
              onFocusConsumed={consumeFocusRequest}
              onKeyboardNavigationStart={startKeyboardNavigation}
              onKeyboardNavigationStop={stopKeyboardNavigation}
              setCaptureApi={setCaptureApi}
            />
          </Canvas>
          {!leftPanelOpen ? (
            <CanvasPanelRestoreButton side="left" title="显示场景节点" onClick={() => setLeftPanelOpen(true)}>
              <IconListTree size={18} />
            </CanvasPanelRestoreButton>
          ) : null}
          {!rightPanelOpen ? (
            <CanvasPanelRestoreButton side="right" title="显示属性" onClick={() => setRightPanelOpen(true)}>
              <IconSettings size={18} />
            </CanvasPanelRestoreButton>
          ) : null}
          {isTrajectoryPlaying ? (
            <PlaybackCameraMonitor
              state={state}
              activeTrajectoryIds={activePlaybackTrajectoryIds}
              rightPanelCollapsed={!rightPanelOpen}
            />
          ) : selectedCamera ? (
            <CameraPreview
              camera={selectedCamera}
              state={state}
              activeTrajectoryIds={activePlaybackTrajectoryIds}
              readOnly={readOnly}
              cameraViewEditing={cameraViewEditId === selectedCamera.id}
              rightPanelCollapsed={!rightPanelOpen}
              onAspectChange={changeSelectedCameraAspect}
              onLensDepthChange={changeSelectedCameraLensDepth}
              onToggleViewEdit={toggleCameraViewEdit}
              onLevelCamera={levelSelectedCamera}
              onScreenshot={captureSelectedCamera}
            />
          ) : null}
          {cameraViewEditCamera ? (
            <div className="pointer-events-auto absolute left-1/2 top-4 z-[3] flex -translate-x-1/2 items-center gap-2 rounded-[8px] border border-[var(--nomi-line-soft)] bg-[var(--nomi-paper)] px-3 py-2 text-[12px] text-[var(--nomi-ink)] shadow-[var(--nomi-shadow-md)]">
              <IconCamera size={15} className="text-[var(--nomi-ink-60)]" />
              <span className="max-w-[220px] truncate">取景调整 · {cameraViewEditCamera.name}</span>
              <button
                className="rounded-[6px] bg-[var(--nomi-ink-05)] px-2 py-1 text-[11px] text-[var(--nomi-ink-60)] hover:bg-[var(--nomi-ink-10)] hover:text-[var(--nomi-ink)]"
                type="button"
                onClick={exitCameraViewEdit}
              >
                退出
              </button>
            </div>
          ) : null}
          <div className="pointer-events-none absolute bottom-4 left-4 grid size-20 place-items-center rounded-[8px] border border-[var(--nomi-line-soft)] bg-[var(--nomi-paper)] text-[10px] text-[var(--nomi-ink-60)] shadow-[var(--nomi-shadow-md)]">
            <div className="grid gap-1">
              <span className="text-red-300">X</span>
              <span className="text-green-300">Y</span>
              <span className="text-blue-300">Z</span>
            </div>
          </div>
          {!readOnly ? (
            <SceneAddToolbar
              onAddObject={addObject}
              onAddCrowd={addCrowd}
              onAddCamera={addCamera}
              trajectoryMode={trajectoryMode}
              onToggleTrajectoryMode={toggleTrajectoryMode}
              canvasFocusMode={canvasFocusMode}
              onToggleCanvasFocusMode={toggleCanvasFocusMode}
            />
          ) : null}
          {trajectoryMode && trajectoryTimelineVisible ? (
            <React.Suspense fallback={null}>
              <LazyTrajectoryTimeline
                visible
                isPlaying={isTrajectoryPlaying}
                readOnly={readOnly}
                activeGroupId={activeTrajectoryGroupId}
                playheadRef={playheadRef}
                onPlayChange={handleTrajectoryPlayChange}
                onSelectGroup={selectTrajectoryPlaybackGroup}
                onClose={closeTrajectoryTimeline}
                onAddGroup={addTrajectoryGroup}
                onRenameGroup={renameTrajectoryGroup}
                onPatchBinding={patchTrajectoryBinding}
                onPatchTrajectoryPoint={patchTrajectoryPoint}
              />
            </React.Suspense>
          ) : null}
        </div>

        <AnimatePresence initial={false}>
          {rightPanelOpen ? (
            <motion.aside
              key="scene-property-panel"
              animate={{ opacity: 1, scale: 1, width: 300, x: 0 }}
              className="relative z-[2] flex min-h-0 shrink-0 flex-col overflow-hidden border-l border-[var(--workbench-border)] bg-[var(--workbench-surface-solid)] shadow-[-8px_0_28px_rgba(18,24,38,0.06)]"
              exit={{ opacity: 0, scale: 0.16, width: 0, x: 26 }}
              initial={{ opacity: 0, scale: 0.16, width: 0, x: 26 }}
              style={{ transformOrigin: 'top right' }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            >
              <PropertyPanel
                state={state}
                selection={selection}
                readOnly={readOnly}
                trajectoryMode={trajectoryMode}
                activeTrajectoryId={activeTrajectoryId}
                activePointId={activeTrajectoryPointId}
                onObjectPatch={patchObject}
                onCameraPatch={patchCamera}
                onAddTrajectory={addTrajectory}
                onSelectTrajectory={selectTrajectory}
                onDeleteTrajectory={deleteTrajectory}
                onPatchTrajectory={patchTrajectory}
                onAddTrajectoryPoint={addTrajectoryPoint}
                onSelectTrajectoryPoint={selectTrajectoryPoint}
                onUpdateTrajectoryPoint={updateTrajectoryPoint}
                onDeleteTrajectoryPoint={deleteTrajectoryPoint}
                onBindObjectToTrajectory={bindObjectToTrajectory}
                onPatchTrajectoryBinding={patchTrajectoryBinding}
                onPatchBoundObject={patchBoundObject}
                onUnbindObject={unbindObject}
                onDeleteTrajectoryBinding={deleteTrajectoryBinding}
                onEnvironmentPatch={patchEnvironment}
              />
            </motion.aside>
          ) : null}
        </AnimatePresence>
      </main>

    </div>
  )

  return typeof document === 'undefined' ? editorShell : createPortal(editorShell, document.body)
}
