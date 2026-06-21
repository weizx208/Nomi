import React from 'react'
import { Environment, Grid, Sky } from '@react-three/drei'
import {
  type Scene3DCamera,
  type Scene3DControlMode,
  type Scene3DObject,
  type Scene3DSelection,
  type Scene3DState,
  type Scene3DTransformMode,
  type Scene3DVector3,
} from './scene3dTypes'
import type { TrajectoryBindTarget } from './trajectory/TrajectoryRenderer'
import { useTrajectoryAnimation } from './trajectory/useTrajectoryAnimation'
import { useScene3DTrajectoryRuntimeStore } from './trajectory/trajectoryRuntimeStore'
import {
  DARK_GRID_CELL_COLOR,
  DARK_GRID_SECTION_COLOR,
  GRID_CELL_COLOR,
  GRID_SECTION_COLOR,
  SCENE3D_GRID_FLAG,
  type CaptureApi,
  cameraWithPlaybackPosition,
  crowdCount,
  mannequinRoleLabel,
} from './scene3dShared'
import {
  CameraStateRecorder,
  CaptureBinder,
  FocusController,
  InitialCameraPose,
  Scene3DControls,
} from './Scene3DControls'
import { CameraHelperView } from './Scene3DCameraHelper'
import { CameraViewEditController } from './Scene3DCameraPreview'
import { MannequinAssetBoundary, SceneObjectView } from './Scene3DObjects'

export {
  CameraPreview,
  PlaybackCameraMonitor,
} from './Scene3DCameraPreview'

const LazyTrajectoryRenderer = React.lazy(() =>
  import('./trajectory/TrajectoryRenderer').then((module) => ({
    default: module.TrajectoryRenderer,
  })),
)

export const SceneContent = React.memo(function SceneContent({
  state,
  selection,
  readOnly,
  transformMode,
  flySpeed,
  focusId,
  viewLocked,
  cameraViewEditCamera,
  trajectoryMode,
  activeTrajectoryId,
  activeTrajectoryPointId,
  activePlaybackTrajectoryIds,
  playheadRef,
  isTrajectoryPlaying,
  setIsTrajectoryPlaying,
  onSelect,
  onFocus,
  onObjectPatch,
  onCameraPatch,
  onTrajectorySelect,
  onTrajectoryPointSelect,
  onTrajectoryCreateAt,
  onTrajectoryPointInsert,
  onTrajectoryCurveControlUpdate,
  onTrajectoryPointUpdate,
  onTrajectoryMove,
  onTrajectoryEdit,
  onTrajectoryDelete,
  onBindTargetToTrajectory,
  onEditorCameraDraft,
  onEditorCameraCommit,
  onEditorCameraTargetChange,
  onWheelNavigation,
  onTransformInteractionStart,
  onTransformInteractionEnd,
  onFocusConsumed,
  onKeyboardNavigationStart,
  onKeyboardNavigationStop,
  setCaptureApi,
}: {
  state: Scene3DState
  selection: Scene3DSelection
  readOnly: boolean
  transformMode: Scene3DTransformMode
  flySpeed: number
  focusId: string
  viewLocked: boolean
  cameraViewEditCamera?: Scene3DCamera
  trajectoryMode: boolean
  activeTrajectoryId: string | null
  activeTrajectoryPointId: string | null
  activePlaybackTrajectoryIds: ReadonlySet<string> | null
  playheadRef: React.MutableRefObject<number>
  isTrajectoryPlaying: boolean
  setIsTrajectoryPlaying: (playing: boolean) => void
  onSelect: (selection: Scene3DSelection) => void
  onFocus: (id: string) => void
  onObjectPatch: (id: string, patch: Partial<Scene3DObject>) => void
  onCameraPatch: (id: string, patch: Partial<Scene3DCamera>) => void
  onTrajectorySelect: (trajectoryId: string) => void
  onTrajectoryPointSelect: (trajectoryId: string, pointId: string) => void
  onTrajectoryCreateAt: (position: Scene3DVector3) => void
  onTrajectoryPointInsert: (
    trajectoryId: string,
    position: Scene3DVector3,
    targetPointId?: string | null,
    placement?: 'before' | 'after',
  ) => void
  onTrajectoryCurveControlUpdate: (trajectoryId: string, segmentStartPointId: string, position: Scene3DVector3 | null) => void
  onTrajectoryPointUpdate: (trajectoryId: string, pointId: string, position: Scene3DVector3) => void
  onTrajectoryMove: (trajectoryId: string, delta: Scene3DVector3) => void
  onTrajectoryEdit: (trajectoryId: string) => void
  onTrajectoryDelete: (trajectoryId: string) => void
  onBindTargetToTrajectory: (trajectoryId: string, targetId: string) => void
  onEditorCameraDraft: (cameraState: Scene3DState['editorCamera']) => void
  onEditorCameraCommit: (cameraState: Scene3DState['editorCamera']) => void
  onEditorCameraTargetChange: (target: Scene3DVector3) => void
  onWheelNavigation: (cameraState: Scene3DState['editorCamera']) => void
  onTransformInteractionStart: () => void
  onTransformInteractionEnd: () => void
  onFocusConsumed: () => void
  onKeyboardNavigationStart: () => void
  onKeyboardNavigationStop: () => void
  setCaptureApi: (api: CaptureApi | null) => void
}): JSX.Element {
  const freeLook = !viewLocked
  const controlMode: Scene3DControlMode = freeLook ? 'fly' : 'edit'
  const cameraViewEditing = Boolean(cameraViewEditCamera)
  const navigationLockedRef = React.useRef(false)
  const playheadSeconds = useScene3DTrajectoryRuntimeStore((runtime) => runtime.playheadSeconds)
  useTrajectoryAnimation({
    isPlaying: isTrajectoryPlaying,
    setIsPlaying: setIsTrajectoryPlaying,
    playheadRef,
    activeTrajectoryIds: activePlaybackTrajectoryIds,
  })
  const cameraViewEditData = React.useMemo(() => (
    cameraViewEditCamera
      ? cameraWithPlaybackPosition(state, cameraViewEditCamera, playheadSeconds, activePlaybackTrajectoryIds)
      : undefined
  ), [activePlaybackTrajectoryIds, cameraViewEditCamera, playheadSeconds, state.objects, state.trajectories, state.trajectoryBindings])
  const mannequinRoleData = React.useMemo(() => {
    const labels = new Map<string, string>()
    const starts = new Map<string, number>()
    let index = 0
    state.objects.forEach((object) => {
      if (object.type === 'mannequin') {
        labels.set(object.id, mannequinRoleLabel(index))
        starts.set(object.id, index)
        index += 1
        return
      }
      if (object.type === 'mannequinCrowd') {
        starts.set(object.id, index)
        index += crowdCount(object)
      }
    })
    return { labels, starts }
  }, [state.objects])
  const trajectoryBindTargets = React.useMemo<TrajectoryBindTarget[]>(() => [
    ...state.objects
      .filter((object) => object.type === 'mannequin' || object.type === 'mannequinCrowd')
      .map((object) => ({
        id: object.id,
        name: object.name,
        type: 'mannequin' as const,
      })),
    ...state.cameras.map((camera) => ({
      id: camera.id,
      name: camera.name,
      type: 'camera' as const,
    })),
  ], [state.cameras, state.objects])
  const gridCellColor = state.environment.darkMode ? DARK_GRID_CELL_COLOR : GRID_CELL_COLOR
  const gridSectionColor = state.environment.darkMode ? DARK_GRID_SECTION_COLOR : GRID_SECTION_COLOR
  const selectObject = React.useCallback((id: string) => {
    onSelect({ type: 'object', id })
  }, [onSelect])
  const selectCamera = React.useCallback((id: string) => {
    onSelect({ type: 'camera', id })
  }, [onSelect])
  const clearSelectionFromControls = React.useCallback(() => {
    onSelect(null)
  }, [onSelect])
  const patchCameraFromHelper = React.useCallback((id: string, patch: Partial<Scene3DCamera>) => {
    onCameraPatch(id, patch.target ? { ...patch, followTargetId: undefined } : patch)
  }, [onCameraPatch])

  return (
    <>
      <color attach="background" args={[state.environment.backgroundColor]} />
      <ambientLight intensity={0.65} />
      {state.environment.showSky ? <Sky sunPosition={[2, 1, 4]} /> : null}
      {state.environment.preset ? (
        <MannequinAssetBoundary fallback={null}>
          <React.Suspense fallback={null}>
            <Environment preset="city" />
          </React.Suspense>
        </MannequinAssetBoundary>
      ) : null}
      {state.environment.showGrid && !cameraViewEditing ? (
        <group userData={{ [SCENE3D_GRID_FLAG]: true }}>
          <Grid
            infiniteGrid
            cellSize={0.5}
            sectionSize={5}
            fadeDistance={42}
            fadeStrength={1.25}
            cellColor={gridCellColor}
            sectionColor={gridSectionColor}
          />
        </group>
      ) : null}
      {state.environment.showAxes && !cameraViewEditing ? <axesHelper args={[2]} /> : null}
      {(trajectoryMode || state.trajectories.length > 0) && !cameraViewEditing ? (
        <React.Suspense fallback={null}>
          <LazyTrajectoryRenderer
            trajectories={state.trajectories}
            activeTrajectoryId={activeTrajectoryId}
            activePointId={trajectoryMode ? activeTrajectoryPointId : null}
            editable={trajectoryMode && !readOnly}
            wholeDraggable={!trajectoryMode && !readOnly}
            onSelectTrajectory={onTrajectorySelect}
            onSelectPoint={onTrajectoryPointSelect}
            onCreateTrajectoryAt={onTrajectoryCreateAt}
            onInsertPoint={onTrajectoryPointInsert}
            onUpdateCurveControl={onTrajectoryCurveControlUpdate}
            onUpdatePoint={onTrajectoryPointUpdate}
            onTranslateTrajectory={onTrajectoryMove}
            onEditTrajectory={onTrajectoryEdit}
            onDeleteTrajectory={onTrajectoryDelete}
            bindTargets={trajectoryBindTargets}
            onBindTargetToTrajectory={onBindTargetToTrajectory}
          />
        </React.Suspense>
      ) : null}
      {state.objects.map((object) => (
        <SceneObjectView
          key={object.id}
          object={object}
          selected={selection?.type === 'object' && selection.id === object.id}
          readOnly={readOnly || trajectoryMode}
          interactionDisabled={trajectoryMode}
          transformMode={transformMode}
          orbitControlsActive={!freeLook}
          navigationLockedRef={navigationLockedRef}
          roleLabel={object.type === 'mannequin' ? mannequinRoleData.labels.get(object.id) : undefined}
          roleStartIndex={mannequinRoleData.starts.get(object.id)}
          onSelectObject={selectObject}
          onFocusObject={onFocus}
          onTransformStart={onTransformInteractionStart}
          onTransformEnd={onTransformInteractionEnd}
          onObjectPatch={onObjectPatch}
        />
      ))}
      {!cameraViewEditing ? state.cameras.map((camera) => {
        const displayCamera = cameraWithPlaybackPosition(state, camera, playheadSeconds, activePlaybackTrajectoryIds)
        return (
          <CameraHelperView
            key={camera.id}
            cameraData={displayCamera}
            selected={selection?.type === 'camera' && selection.id === camera.id}
            readOnly={readOnly}
            positionLocked={trajectoryMode}
            orbitControlsActive={!freeLook}
            navigationLockedRef={navigationLockedRef}
            onSelectCamera={selectCamera}
            onFocusCamera={onFocus}
            onTransformStart={onTransformInteractionStart}
            onTransformEnd={onTransformInteractionEnd}
            onCameraPatch={patchCameraFromHelper}
          />
        )
      }) : null}
      <InitialCameraPose editorCamera={state.editorCamera} />
      <CameraViewEditController
        cameraData={cameraViewEditData}
        onCameraPatch={onCameraPatch}
        onEditorCameraDraft={onEditorCameraDraft}
      />
      <FocusController
        focusId={focusId}
        objects={state.objects}
        cameras={state.cameras}
        onTargetChange={onEditorCameraTargetChange}
        onFocusConsumed={onFocusConsumed}
      />
      <Scene3DControls
        freeLook={freeLook}
        selectionActive={selection !== null}
        speed={flySpeed}
        target={state.editorCamera.target}
        navigationLockedRef={navigationLockedRef}
        onClearSelection={clearSelectionFromControls}
        onWheelNavigation={onWheelNavigation}
        onKeyboardNavigationStart={onKeyboardNavigationStart}
        onKeyboardNavigationStop={onKeyboardNavigationStop}
      />
      <CameraStateRecorder
        mode={controlMode}
        target={state.editorCamera.target}
        onDraftChange={onEditorCameraDraft}
        onCommit={onEditorCameraCommit}
      />
      <CaptureBinder setApi={setCaptureApi} />
    </>
  )
})
