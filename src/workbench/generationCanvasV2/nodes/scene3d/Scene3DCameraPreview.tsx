import React from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Sky } from '@react-three/drei'
import { IconCamera, IconEye, IconRotate } from '@tabler/icons-react'
import * as THREE from 'three'
import { cn } from '../../../../utils/cn'
import {
  SCENE3D_ASPECT_OPTIONS,
  SCENE3D_ASPECT_RATIOS,
  type Scene3DAspectRatio,
  type Scene3DCamera,
  type Scene3DObject,
  type Scene3DState,
  type Scene3DVector3,
} from './scene3dTypes'
import { clampRatio } from './trajectory/trajectoryUtils'
import { useScene3DTrajectoryRuntimeStore } from './trajectory/trajectoryRuntimeStore'
import {
  CAMERA_DEFAULT_TARGET,
  applyEditorCameraPose,
  applySceneCameraPose,
  cameraWithPlaybackPosition,
  crowdCount,
  eulerToArray,
  objectWithPlaybackPose,
  playbackCameraAtPlayhead,
  vectorFromArray,
  vectorToArray,
} from './scene3dShared'
import {
  LightObject,
  Mannequin,
  MannequinAssetBoundary,
  ProceduralMannequin,
  ProceduralMannequinCrowd,
  Scene3DMeshGeometry,
} from './Scene3DObjects'

function cameraPreviewViewportStyle(aspectRatio: Scene3DAspectRatio): React.CSSProperties {
  const ratio = SCENE3D_ASPECT_RATIOS[aspectRatio]
  const maxWidth = 224
  const maxHeight = 240
  let width = maxWidth
  let height = width / ratio
  if (height > maxHeight) {
    height = maxHeight
    width = height * ratio
  }
  return {
    width: `${Math.round(width)}px`,
    height: `${Math.round(height)}px`,
  }
}

function CameraPreviewPose({ cameraData }: { cameraData: Scene3DCamera }): null {
  const { camera } = useThree()

  React.useLayoutEffect(() => {
    applySceneCameraPose(camera, cameraData)
  }, [camera, cameraData])

  return null
}

export function CameraViewEditController({
  cameraData,
  onCameraPatch,
  onEditorCameraDraft,
}: {
  cameraData?: Scene3DCamera
  onCameraPatch: (id: string, patch: Partial<Scene3DCamera>) => void
  onEditorCameraDraft: (cameraState: Scene3DState['editorCamera']) => void
}): null {
  const { camera } = useThree()
  const activeCameraIdRef = React.useRef('')
  const targetDistanceRef = React.useRef(3)
  const lastPatchTimeRef = React.useRef(0)

  React.useLayoutEffect(() => {
    if (!cameraData) {
      activeCameraIdRef.current = ''
      return
    }
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = cameraData.fov
      camera.near = cameraData.near
      camera.far = cameraData.far
      camera.updateProjectionMatrix()
    }
    if (activeCameraIdRef.current === cameraData.id) return
    activeCameraIdRef.current = cameraData.id
    targetDistanceRef.current = Math.max(
      0.75,
      vectorFromArray(cameraData.target || CAMERA_DEFAULT_TARGET).distanceTo(vectorFromArray(cameraData.position)),
    )
    applyEditorCameraPose(camera, {
      position: cameraData.position,
      target: cameraData.target || CAMERA_DEFAULT_TARGET,
    })
  }, [camera, cameraData])

  useFrame((state) => {
    if (!cameraData) return
    if (state.clock.elapsedTime - lastPatchTimeRef.current < 0.08) return
    lastPatchTimeRef.current = state.clock.elapsedTime

    const position = vectorToArray(camera.position)
    const target = cameraData.followTargetId
      ? cameraData.target
      : (() => {
          const direction = new THREE.Vector3()
          camera.getWorldDirection(direction)
          return vectorToArray(camera.position.clone().addScaledVector(direction, targetDistanceRef.current))
        })()
    if (cameraData.followTargetId) {
      camera.lookAt(vectorFromArray(target))
      camera.updateMatrixWorld(true)
    }
    const rotation = eulerToArray(camera.rotation)
    const editorCamera = { position, target, rotation, mode: 'fly' } satisfies Scene3DState['editorCamera']
    onEditorCameraDraft(editorCamera)
    onCameraPatch(cameraData.id, cameraData.followTargetId
      ? {
          position,
          rotation,
        }
      : {
          position,
          target,
          rotation,
        })
  })

  return null
}

function PreviewObjectView({
  object,
  roleStartIndex = 0,
}: {
  object: Scene3DObject
  roleStartIndex?: number
}): JSX.Element {
  return (
    <group
      visible={object.visible}
      position={object.position}
      rotation={object.rotation}
      scale={object.scale}
    >
      {object.type === 'mannequin' ? (
        <MannequinAssetBoundary fallback={<ProceduralMannequin color={object.color || '#808080'} />}>
          <React.Suspense fallback={<ProceduralMannequin color={object.color || '#808080'} />}>
            <Mannequin color={object.color || '#808080'} pose={object.pose} />
          </React.Suspense>
        </MannequinAssetBoundary>
      ) : object.type === 'mannequinCrowd' ? (
        <ProceduralMannequinCrowd object={object} roleStartIndex={roleStartIndex} />
      ) : object.type === 'light' ? (
        <LightObject object={object} />
      ) : (
        <mesh>
          <Scene3DMeshGeometry geometry={object.geometry} />
          <meshStandardMaterial
            color={object.color || '#808080'}
            roughness={0.55}
            metalness={0.04}
            side={object.geometry === 'plane' ? THREE.DoubleSide : THREE.FrontSide}
          />
        </mesh>
      )}
    </group>
  )
}

const CameraPreviewScene = React.memo(function CameraPreviewScene({
  state,
  cameraData,
  playheadSeconds,
  activeTrajectoryIds,
}: {
  state: Scene3DState
  cameraData: Scene3DCamera
  playheadSeconds: number
  activeTrajectoryIds: ReadonlySet<string> | null
}): JSX.Element {
  let roleIndex = 0
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
      {state.environment.showAxes ? <axesHelper args={[2]} /> : null}
      {state.objects.map((object) => {
        const roleStartIndex = roleIndex
        if (object.type === 'mannequin') roleIndex += 1
        if (object.type === 'mannequinCrowd') roleIndex += crowdCount(object)
        return (
          <PreviewObjectView
            key={object.id}
            object={objectWithPlaybackPose(state, object, playheadSeconds, activeTrajectoryIds)}
            roleStartIndex={roleStartIndex}
          />
        )
      })}
      <CameraPreviewPose cameraData={cameraData} />
    </>
  )
})

export const CameraPreview = React.memo(function CameraPreview({
  camera,
  state,
  activeTrajectoryIds,
  readOnly,
  cameraViewEditing,
  rightPanelCollapsed,
  onAspectChange,
  onLensDepthChange,
  onToggleViewEdit,
  onLevelCamera,
  onScreenshot,
}: {
  camera: Scene3DCamera
  state: Scene3DState
  activeTrajectoryIds: ReadonlySet<string> | null
  readOnly: boolean
  cameraViewEditing: boolean
  rightPanelCollapsed: boolean
  onAspectChange: (aspectRatio: Scene3DAspectRatio) => void
  onLensDepthChange: (lensDepth: number) => void
  onToggleViewEdit: () => void
  onLevelCamera: () => void
  onScreenshot: () => void
}): JSX.Element {
  const playheadSeconds = useScene3DTrajectoryRuntimeStore((runtime) => runtime.playheadSeconds)
  const previewCamera = React.useMemo(
    () => cameraWithPlaybackPosition(state, camera, playheadSeconds, activeTrajectoryIds),
    [activeTrajectoryIds, camera, playheadSeconds, state.objects, state.trajectories, state.trajectoryBindings],
  )
  const previewStyle = React.useMemo(() => cameraPreviewViewportStyle(camera.aspectRatio), [camera.aspectRatio])
  const lensDepth = camera.lensDepth ?? 0

  return (
    <div
      className={cn(
        'absolute right-4 z-[3] w-[260px] rounded-[8px] border border-[var(--nomi-line-soft)] bg-[var(--nomi-paper)] p-2 text-[var(--nomi-ink)] shadow-[var(--nomi-shadow-md)]',
        rightPanelCollapsed ? 'top-16' : 'top-4',
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0 truncate text-[12px] font-medium">{camera.name} · {camera.aspectRatio}</div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            className={cn(
              'inline-flex h-7 items-center gap-1 rounded-[6px] px-2 text-[11px] hover:bg-[var(--nomi-ink-10)] hover:text-[var(--nomi-ink)] disabled:opacity-40',
              cameraViewEditing ? 'bg-[var(--nomi-ink)] text-[var(--nomi-paper)]' : 'bg-[var(--nomi-ink-05)] text-[var(--nomi-ink-60)]',
            )}
            disabled={readOnly}
            type="button"
            title={cameraViewEditing ? '正在取景调整，按 Esc 或点击顶部退出' : '从相机视角调整'}
            onClick={onToggleViewEdit}
          >
            <IconEye size={14} />
            <span>取景</span>
          </button>
          <button
            className="grid size-7 place-items-center rounded-[6px] bg-[var(--nomi-ink-05)] text-[var(--nomi-ink-60)] hover:bg-[var(--nomi-ink-10)] hover:text-[var(--nomi-ink)] disabled:opacity-40"
            disabled={readOnly}
            type="button"
            title="水平摆正"
            onClick={onLevelCamera}
          >
            <IconRotate size={14} />
          </button>
          <button className="grid size-7 place-items-center rounded-[6px] bg-[var(--nomi-ink-05)] text-[var(--nomi-ink-60)] hover:bg-[var(--nomi-ink-10)] hover:text-[var(--nomi-ink)]" type="button" title="相机截图" onClick={onScreenshot}>
            <IconCamera size={15} />
          </button>
        </div>
      </div>
      <div className="flex min-h-[126px] items-center justify-center rounded-[6px] border border-[var(--nomi-line-soft)] bg-[var(--nomi-ink-05)] p-1">
        <div className="overflow-hidden rounded-[5px] bg-[var(--nomi-ink)]" style={previewStyle}>
          <Canvas
            camera={{
              fov: previewCamera.fov,
              near: previewCamera.near,
              far: previewCamera.far,
              position: previewCamera.position,
              rotation: previewCamera.rotation,
            }}
            dpr={[1, 1.5]}
            frameloop="demand"
            gl={{ antialias: true, preserveDrawingBuffer: false }}
          >
            <CameraPreviewScene
              state={state}
              cameraData={previewCamera}
              playheadSeconds={playheadSeconds}
              activeTrajectoryIds={activeTrajectoryIds}
            />
          </Canvas>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-5 gap-1">
        {SCENE3D_ASPECT_OPTIONS.map((option) => (
          <button
            key={option}
            className={cn(
              'h-6 rounded-[5px] border border-[var(--nomi-line-soft)] text-[10px] text-[var(--nomi-ink-60)] hover:bg-[var(--nomi-ink-05)] hover:text-[var(--nomi-ink)]',
              option === camera.aspectRatio && 'bg-[var(--nomi-ink)] text-[var(--nomi-paper)]',
            )}
            disabled={readOnly}
            type="button"
            onClick={() => onAspectChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
      <div className="mt-3 rounded-[7px] border border-[var(--nomi-line-soft)] bg-[var(--nomi-ink-05)] px-2 py-2">
        <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-[var(--nomi-ink-60)]">
          <span>镜头深度</span>
          <span className="font-medium text-[var(--nomi-ink)]">{Math.round(lensDepth)}%</span>
        </div>
        <input
          className="block h-1.5 w-full accent-[var(--nomi-ink)]"
          disabled={readOnly}
          max={100}
          min={-100}
          step={1}
          type="range"
          value={lensDepth}
          onChange={(event) => onLensDepthChange(Number(event.currentTarget.value))}
        />
        <div className="mt-1 grid grid-cols-3 text-[10px] text-[var(--nomi-ink-45)]">
          <span>-100%</span>
          <span className="text-center">0</span>
          <span className="text-right">100%</span>
        </div>
      </div>
    </div>
  )
})

export const PlaybackCameraMonitor = React.memo(function PlaybackCameraMonitor({
  state,
  activeTrajectoryIds,
  rightPanelCollapsed,
}: {
  state: Scene3DState
  activeTrajectoryIds: ReadonlySet<string> | null
  rightPanelCollapsed: boolean
}): JSX.Element | null {
  const playheadSeconds = useScene3DTrajectoryRuntimeStore((runtime) => runtime.playheadSeconds)
  const activeCamera = React.useMemo(
    () => playbackCameraAtPlayhead(state, playheadSeconds, activeTrajectoryIds),
    [activeTrajectoryIds, playheadSeconds, state.cameras, state.trajectories, state.trajectoryBindings],
  )

  if (!activeCamera) return null

  const previewCamera = cameraWithPlaybackPosition(state, activeCamera.camera, playheadSeconds, activeTrajectoryIds)
  const previewStyle = cameraPreviewViewportStyle(previewCamera.aspectRatio)
  const duration = Math.max(0.001, activeCamera.binding.endTime - activeCamera.binding.startTime)
  const progress = clampRatio((playheadSeconds - activeCamera.binding.startTime) / duration)

  return (
    <div
      className={cn(
        'pointer-events-none absolute right-4 z-[4] w-[260px] rounded-[8px] border border-[var(--nomi-line-soft)] bg-[var(--nomi-paper)] p-2 text-[var(--nomi-ink)] shadow-[var(--nomi-shadow-md)]',
        rightPanelCollapsed ? 'top-16' : 'top-4',
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0 truncate text-[12px] font-medium">
          {activeCamera.camera.name} · {activeCamera.trajectory.name}
        </div>
        <div className="shrink-0 text-[10px] tabular-nums text-[var(--nomi-ink-45)]">
          {Math.round(progress * 100)}%
        </div>
      </div>
      <div className="flex min-h-[126px] items-center justify-center rounded-[6px] border border-[var(--nomi-line-soft)] bg-[var(--nomi-ink-05)] p-1">
        <div className="overflow-hidden rounded-[5px] bg-[var(--nomi-ink)]" style={previewStyle}>
          <Canvas
            camera={{
              fov: previewCamera.fov,
              near: previewCamera.near,
              far: previewCamera.far,
              position: previewCamera.position,
              rotation: previewCamera.rotation,
            }}
            dpr={[1, 1.5]}
            frameloop="always"
            gl={{ antialias: true, preserveDrawingBuffer: false }}
          >
            <CameraPreviewScene
              state={state}
              cameraData={previewCamera}
              playheadSeconds={playheadSeconds}
              activeTrajectoryIds={activeTrajectoryIds}
            />
          </Canvas>
        </div>
      </div>
    </div>
  )
})
