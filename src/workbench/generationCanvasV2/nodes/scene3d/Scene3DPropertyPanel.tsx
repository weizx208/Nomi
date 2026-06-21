import React from 'react'
import { IconSettings } from '@tabler/icons-react'
import { Switch } from '../../../../ui/switch'
import { cn } from '../../../../utils/cn'
import {
  SCENE3D_ASPECT_OPTIONS,
  type Scene3DAspectRatio,
  type Scene3DCamera,
  type Scene3DLightType,
  type Scene3DObject,
  type Scene3DSelection,
  type Scene3DState,
  type Scene3DTrajectory,
  type Scene3DTrajectoryBinding,
  type Scene3DTrajectoryBoundObject,
  type Scene3DVector3,
} from './scene3dTypes'
import {
  CROWD_MAX_AXIS,
  MANNEQUIN_POSE_MAX_DEG,
  MANNEQUIN_POSE_MIN_DEG,
  MANNEQUIN_POSE_PRESETS,
  MANNEQUIN_POSE_SECTIONS,
  SCENE3D_DARK_BACKGROUND,
  SCENE3D_LIGHT_BACKGROUND,
  type MannequinPosePreset,
  type MannequinPoseControl,
  cameraLookAtRotation,
  clonePoseValue,
  degreesToRadians,
  mannequinPoseOffsetForBone,
  numberInputValue,
  poseMatchesPreset,
  radiansToDegrees,
  updateVectorValue,
} from './scene3dShared'

const LazyTrajectoryPanel = React.lazy(() =>
  import('./trajectory/TrajectoryPanel').then((module) => ({
    default: module.TrajectoryPanel,
  })),
)

const VectorInputs = React.memo(function VectorInputs({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string
  value: Scene3DVector3
  disabled?: boolean
  onChange: (value: Scene3DVector3) => void
}): JSX.Element {
  return (
    <label className="grid gap-1">
      <span className="text-[11px] text-[var(--nomi-ink-60)]">{label}</span>
      <span className="grid grid-cols-3 gap-1">
        {value.map((part, index) => (
          <input
            key={index}
            className="h-8 min-w-0 rounded-[6px] border border-[var(--nomi-line)] bg-[var(--nomi-paper)] px-2 text-[12px] text-[var(--nomi-ink)] outline-none focus:border-[var(--nomi-accent)] disabled:opacity-50"
            disabled={disabled}
            step="0.1"
            type="number"
            value={numberInputValue(part)}
            onChange={(event) => onChange(updateVectorValue(value, index, Number(event.currentTarget.value)))}
          />
        ))}
      </span>
    </label>
  )
})

const ColorField = React.memo(function ColorField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string
  value: string
  disabled?: boolean
  onChange: (value: string) => void
}): JSX.Element {
  const color = /^#[0-9a-f]{6}$/i.test(value) ? value : '#808080'
  const displayValue = color.toUpperCase()

  return (
    <div className="grid gap-1">
      <span className="text-[11px] text-[var(--nomi-ink-60)]">{label}</span>
      <div className="grid grid-cols-[32px_minmax(0,1fr)] items-center gap-2">
        <label
          className={cn(
            'relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-[7px] border border-[var(--nomi-line)]',
            disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-[var(--nomi-accent)]',
          )}
          title={disabled ? undefined : '选择颜色'}
        >
          <span className="absolute inset-0" style={{ backgroundColor: color }} />
          <input
            className="absolute inset-0 size-full cursor-inherit opacity-0"
            disabled={disabled}
            type="color"
            value={color}
            onChange={(event) => onChange(event.currentTarget.value)}
          />
        </label>
        <input
          aria-label={`${label}值`}
          className="h-8 min-w-0 rounded-[6px] border border-[var(--nomi-line)] bg-[var(--nomi-ink-05)] px-2 font-mono text-[12px] font-medium uppercase text-[var(--nomi-ink)] outline-none disabled:opacity-50"
          disabled={disabled}
          readOnly
          value={displayValue}
        />
      </div>
    </div>
  )
})

type SceneObjectInspectorTab = 'properties' | 'pose'

function mannequinPoseControlValue(control: MannequinPoseControl, pose?: Record<string, Scene3DVector3>): number {
  const rotation = pose?.[control.bone] || [0, 0, 0]
  const scale = control.valueScale || 1
  return Number((control.standingValue + radiansToDegrees(rotation[control.axisIndex]) / scale).toFixed(1))
}

export const MannequinPosePanel = React.memo(function MannequinPosePanel({
  object,
  readOnly,
  onObjectPatch,
}: {
  object: Scene3DObject
  readOnly: boolean
  onObjectPatch: (id: string, patch: Partial<Scene3DObject>) => void
}): JSX.Element {
  const updatePoseControl = React.useCallback((control: MannequinPoseControl, degrees: number) => {
    const currentRotation = object.pose?.[control.bone] || [0, 0, 0]
    const scale = control.valueScale || 1
    const offsetDegrees = (degrees - control.standingValue) * scale
    const nextRotation = updateVectorValue(currentRotation, control.axisIndex, degreesToRadians(offsetDegrees))
    onObjectPatch(object.id, {
      pose: {
        ...(object.pose || {}),
        [control.bone]: nextRotation,
      },
    })
  }, [object.id, object.pose, onObjectPatch])

  const applyPosePreset = React.useCallback((preset: MannequinPosePreset) => {
    onObjectPatch(object.id, { pose: clonePoseValue(preset.pose) })
  }, [object.id, onObjectPatch])

  const activePosePresetId = MANNEQUIN_POSE_PRESETS.find((preset) => poseMatchesPreset(object.pose, preset))?.id

  const renderControl = (control: MannequinPoseControl): JSX.Element => {
    const value = mannequinPoseControlValue(control, object.pose)
    const min = control.min ?? MANNEQUIN_POSE_MIN_DEG
    const max = control.max ?? MANNEQUIN_POSE_MAX_DEG
    return (
      <label key={`${control.bone}-${control.axisIndex}-${control.label}`} className="grid grid-cols-[42px_1fr_58px] items-center gap-2 text-[12px] text-[var(--nomi-ink-60)]">
        <span>{control.label}</span>
        <input
          className="h-1.5 w-full accent-[var(--nomi-ink)] disabled:opacity-50"
          disabled={readOnly}
          max={max}
          min={min}
          step={1}
          type="range"
          value={value}
          onChange={(event) => updatePoseControl(control, Number(event.currentTarget.value))}
        />
        <input
          className="h-7 w-full rounded-[7px] border border-[var(--nomi-line-soft)] bg-[var(--nomi-ink-05)] px-2 text-center font-mono text-[12px] text-[var(--nomi-ink)] outline-none focus:border-[var(--nomi-ink-35)] disabled:opacity-50"
          disabled={readOnly}
          max={max}
          min={min}
          step={1}
          type="number"
          value={value}
          onChange={(event) => updatePoseControl(control, Number(event.currentTarget.value))}
        />
      </label>
    )
  }

  return (
    <div className="grid gap-3">
      <div className="rounded-[7px] border border-[var(--nomi-line-soft)] bg-[var(--nomi-ink-05)] px-2 py-2 text-[11px] leading-5 text-[var(--nomi-ink-60)]">
        <div className="font-medium text-[var(--nomi-ink)]">姿势调节</div>
        <div>默认值为站立参数，调整会实时映射到模型骨骼。</div>
      </div>
      <div className="grid gap-2 rounded-[8px] border border-[var(--nomi-line-soft)] bg-[var(--nomi-paper)] p-2">
        <div className="text-[12px] font-medium text-[var(--nomi-ink)]">姿势预设</div>
        <div className="grid grid-cols-4 gap-1.5">
          {MANNEQUIN_POSE_PRESETS.map((preset) => {
            const active = activePosePresetId === preset.id
            return (
              <button
                key={preset.id}
                className={cn(
                  'h-8 rounded-[7px] border border-[var(--nomi-line-soft)] bg-[var(--nomi-ink-05)] px-1 text-[12px] text-[var(--nomi-ink-70)] transition',
                  'hover:bg-[var(--nomi-ink-10)] hover:text-[var(--nomi-ink)] disabled:cursor-not-allowed disabled:opacity-40',
                  active && 'border-[var(--nomi-ink)] bg-[var(--nomi-ink)] text-[var(--nomi-paper)] hover:bg-[var(--nomi-ink)] hover:text-[var(--nomi-paper)]',
                )}
                disabled={readOnly}
                type="button"
                onClick={() => applyPosePreset(preset)}
              >
                {preset.label}
              </button>
            )
          })}
        </div>
      </div>
      <div className="grid gap-3">
        {MANNEQUIN_POSE_SECTIONS.map((section) => (
          <div key={section.title} className="grid gap-2 rounded-[8px] border border-[var(--nomi-line-soft)] bg-[var(--nomi-paper)] p-2">
            <div className="text-[12px] font-medium text-[var(--nomi-ink)]">{section.title}</div>
            {section.controls ? (
              <div className="grid gap-2">{section.controls.map(renderControl)}</div>
            ) : (
              <div className="grid gap-3">
                {section.groups.map((group) => (
                  <div key={group.title} className="grid gap-2">
                    <div className="w-fit rounded-[5px] bg-[var(--nomi-ink-08)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--nomi-ink-70)]">
                      {group.title}
                    </div>
                    <div className="grid gap-2">{group.controls.map(renderControl)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
})

export const PropertyPanel = React.memo(function PropertyPanel({
  state,
  selection,
  readOnly,
  trajectoryMode,
  activeTrajectoryId,
  activePointId,
  onObjectPatch,
  onCameraPatch,
  onEnvironmentPatch,
  onAddTrajectory,
  onSelectTrajectory,
  onDeleteTrajectory,
  onPatchTrajectory,
  onAddTrajectoryPoint,
  onSelectTrajectoryPoint,
  onUpdateTrajectoryPoint,
  onDeleteTrajectoryPoint,
  onBindObjectToTrajectory,
  onPatchTrajectoryBinding,
  onPatchBoundObject,
  onUnbindObject,
  onDeleteTrajectoryBinding,
}: {
  state: Scene3DState
  selection: Scene3DSelection
  readOnly: boolean
  trajectoryMode: boolean
  activeTrajectoryId: string | null
  activePointId: string | null
  onObjectPatch: (id: string, patch: Partial<Scene3DObject>) => void
  onCameraPatch: (id: string, patch: Partial<Scene3DCamera>) => void
  onEnvironmentPatch: (patch: Partial<Scene3DState['environment']>) => void
  onAddTrajectory: () => void
  onSelectTrajectory: (trajectoryId: string) => void
  onDeleteTrajectory: (trajectoryId: string) => void
  onPatchTrajectory: (trajectoryId: string, patch: Partial<Scene3DTrajectory>) => void
  onAddTrajectoryPoint: (trajectoryId: string) => void
  onSelectTrajectoryPoint: (trajectoryId: string, pointId: string) => void
  onUpdateTrajectoryPoint: (trajectoryId: string, pointId: string, position: Scene3DVector3) => void
  onDeleteTrajectoryPoint: (trajectoryId: string, pointId: string) => void
  onBindObjectToTrajectory: (trajectoryId: string, objectId: string) => void
  onPatchTrajectoryBinding: (bindingId: string, patch: Partial<Scene3DTrajectoryBinding>) => void
  onPatchBoundObject: (bindingId: string, objectId: string, patch: Partial<Scene3DTrajectoryBoundObject>) => void
  onUnbindObject: (bindingId: string, objectId: string) => void
  onDeleteTrajectoryBinding: (bindingId: string) => void
}): JSX.Element {
  const selectedObject = selection?.type === 'object'
    ? state.objects.find((object) => object.id === selection.id)
    : undefined
  const selectedCamera = selection?.type === 'camera'
    ? state.cameras.find((camera) => camera.id === selection.id)
    : undefined
  const selectedCameraFollowTarget = selectedCamera?.followTargetId
    ? state.objects.find((object) => object.id === selectedCamera.followTargetId)
    : undefined
  const selectedCameraTargetValue = selectedCameraFollowTarget?.position ?? selectedCamera?.target
  const [objectInspectorTab, setObjectInspectorTab] = React.useState<SceneObjectInspectorTab>('properties')
  const selectedObjectHasPose = selectedObject?.type === 'mannequin' || selectedObject?.type === 'mannequinCrowd'

  React.useEffect(() => {
    setObjectInspectorTab('properties')
  }, [selectedObject?.id])

  React.useEffect(() => {
    if (!selectedObjectHasPose) setObjectInspectorTab('properties')
  }, [selectedObjectHasPose])

  if (trajectoryMode) {
    return (
      <React.Suspense fallback={null}>
        <LazyTrajectoryPanel
          state={state}
          activeTrajectoryId={activeTrajectoryId}
          activePointId={activePointId}
          readOnly={readOnly}
          onAddTrajectory={onAddTrajectory}
          onSelectTrajectory={onSelectTrajectory}
          onDeleteTrajectory={onDeleteTrajectory}
          onPatchTrajectory={onPatchTrajectory}
          onAddPoint={onAddTrajectoryPoint}
          onSelectPoint={onSelectTrajectoryPoint}
          onUpdatePoint={onUpdateTrajectoryPoint}
          onDeletePoint={onDeleteTrajectoryPoint}
          onBindObject={onBindObjectToTrajectory}
          onPatchBinding={onPatchTrajectoryBinding}
          onPatchBoundObject={onPatchBoundObject}
          onUnbindObject={onUnbindObject}
          onDeleteBinding={onDeleteTrajectoryBinding}
        />
      </React.Suspense>
    )
  }

  return (
    <section className="min-h-0 flex-1 overflow-auto bg-[var(--nomi-paper)] px-3 py-3">
      <div className="mb-3 flex items-center gap-2 text-[12px] font-medium text-[var(--nomi-ink)]">
        <IconSettings size={15} />
        属性
      </div>
      {selectedObject ? (
        <div className="grid gap-3">
          {selectedObjectHasPose ? (
            <div className="grid grid-cols-2 gap-1 rounded-[8px] border border-[var(--nomi-line-soft)] bg-[var(--nomi-ink-05)] p-1">
              {([
                ['properties', '属性'],
                ['pose', '姿势'],
              ] as const).map(([tab, label]) => (
                <button
                  key={tab}
                  className={cn(
                    'h-7 rounded-[6px] text-[12px] text-[var(--nomi-ink-60)] transition hover:bg-[var(--nomi-paper)] hover:text-[var(--nomi-ink)]',
                    objectInspectorTab === tab && 'bg-[var(--nomi-paper)] text-[var(--nomi-ink)] shadow-sm',
                  )}
                  type="button"
                  onClick={() => setObjectInspectorTab(tab)}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
          {selectedObjectHasPose && objectInspectorTab === 'pose' ? (
            <MannequinPosePanel object={selectedObject} readOnly={readOnly} onObjectPatch={onObjectPatch} />
          ) : (
            <>
          <label className="grid gap-1">
            <span className="text-[11px] text-[var(--nomi-ink-60)]">名称</span>
            <input
              className="h-8 rounded-[6px] border border-[var(--nomi-line)] bg-[var(--nomi-paper)] px-2 text-[12px] text-[var(--nomi-ink)] outline-none focus:border-[var(--nomi-accent)] disabled:opacity-50"
              disabled={readOnly}
              value={selectedObject.name}
              onChange={(event) => onObjectPatch(selectedObject.id, { name: event.currentTarget.value })}
            />
          </label>
          <VectorInputs label="位置 XYZ" value={selectedObject.position} disabled={readOnly} onChange={(position) => onObjectPatch(selectedObject.id, { position })} />
          <VectorInputs label="旋转 XYZ" value={selectedObject.rotation} disabled={readOnly} onChange={(rotation) => onObjectPatch(selectedObject.id, { rotation })} />
          <VectorInputs label="缩放 XYZ" value={selectedObject.scale} disabled={readOnly} onChange={(scale) => onObjectPatch(selectedObject.id, { scale })} />
          {selectedObject.type === 'mannequinCrowd' ? (
            <div className="grid grid-cols-3 gap-2">
              {([
                ['crowdRows', '行数', 1, CROWD_MAX_AXIS, 1],
                ['crowdColumns', '列数', 1, CROWD_MAX_AXIS, 1],
                ['crowdSpacing', '圆间距', 0.2, 10, 0.1],
              ] as const).map(([field, label, min, max, step]) => (
                <label key={field} className="grid gap-1">
                  <span className="text-[11px] text-[var(--nomi-ink-60)]">{label}</span>
                  <input
                    className="h-8 min-w-0 rounded-[6px] border border-[var(--nomi-line)] bg-[var(--nomi-paper)] px-2 text-[12px] text-[var(--nomi-ink)] outline-none"
                    disabled={readOnly}
                    max={max}
                    min={min}
                    step={step}
                    type="number"
                    value={selectedObject[field] ?? (field === 'crowdSpacing' ? 1.2 : 1)}
                    onChange={(event) => {
                      const value = Number(event.currentTarget.value)
                      if (field === 'crowdSpacing') onObjectPatch(selectedObject.id, { crowdSpacing: Math.min(10, Math.max(0.2, value)) })
                      else onObjectPatch(selectedObject.id, { [field]: Math.min(CROWD_MAX_AXIS, Math.max(1, Math.round(value))) })
                    }}
                  />
                </label>
              ))}
            </div>
          ) : null}
          {(selectedObject.type === 'mesh' || selectedObject.type === 'mannequin') ? (
            <ColorField
              label="颜色"
              value={selectedObject.color || '#808080'}
              disabled={readOnly}
              onChange={(color) => onObjectPatch(selectedObject.id, { color })}
            />
          ) : null}
          {selectedObject.type === 'light' ? (
            <>
              <label className="grid gap-1">
                <span className="text-[11px] text-[var(--nomi-ink-60)]">灯光类型</span>
                <select
                  className="h-8 rounded-[6px] border border-[var(--nomi-line)] bg-[var(--nomi-paper)] px-2 text-[12px] text-[var(--nomi-ink)] outline-none"
                  disabled={readOnly}
                  value={selectedObject.lightType || 'point'}
                  onChange={(event) => onObjectPatch(selectedObject.id, { lightType: event.currentTarget.value as Scene3DLightType })}
                >
                  <option value="point">Point</option>
                  <option value="directional">Directional</option>
                  <option value="spot">Spot</option>
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-[11px] text-[var(--nomi-ink-60)]">强度</span>
                <input
                  className="h-8 rounded-[6px] border border-[var(--nomi-line)] bg-[var(--nomi-paper)] px-2 text-[12px] text-[var(--nomi-ink)] outline-none"
                  disabled={readOnly}
                  min={0}
                  step={0.1}
                  type="number"
                  value={selectedObject.lightIntensity ?? 2}
                  onChange={(event) => onObjectPatch(selectedObject.id, { lightIntensity: Number(event.currentTarget.value) })}
                />
              </label>
              <ColorField
                label="灯光颜色"
                value={selectedObject.lightColor || '#ffffff'}
                disabled={readOnly}
                onChange={(lightColor) => onObjectPatch(selectedObject.id, { lightColor })}
              />
            </>
          ) : null}
            </>
          )}
        </div>
      ) : selectedCamera ? (
        <div className="grid gap-3">
          <label className="grid gap-1">
            <span className="text-[11px] text-[var(--nomi-ink-60)]">名称</span>
            <input
              className="h-8 rounded-[6px] border border-[var(--nomi-line)] bg-[var(--nomi-paper)] px-2 text-[12px] text-[var(--nomi-ink)] outline-none focus:border-[var(--nomi-accent)] disabled:opacity-50"
              disabled={readOnly}
              value={selectedCamera.name}
              onChange={(event) => onCameraPatch(selectedCamera.id, { name: event.currentTarget.value })}
            />
          </label>
          <VectorInputs
            label="相机位置 XYZ"
            value={selectedCamera.position}
            disabled={readOnly}
            onChange={(position) => onCameraPatch(selectedCamera.id, {
              position,
              rotation: cameraLookAtRotation(position, selectedCameraFollowTarget?.position ?? selectedCamera.target),
            })}
          />
          <div className="grid gap-1">
            <span className="text-[11px] text-[var(--nomi-ink-60)]">拍摄目标</span>
            <div className="grid grid-cols-2 gap-1 rounded-[8px] border border-[var(--nomi-line-soft)] bg-[var(--nomi-ink-05)] p-1">
              <button
                className={cn(
                  'h-7 rounded-[6px] text-[12px] text-[var(--nomi-ink-60)] transition hover:bg-[var(--nomi-paper)] hover:text-[var(--nomi-ink)] disabled:opacity-50',
                  !selectedCamera.followTargetId && 'bg-[var(--nomi-paper)] text-[var(--nomi-ink)] shadow-sm',
                )}
                disabled={readOnly}
                type="button"
                onClick={() => onCameraPatch(selectedCamera.id, {
                  followTargetId: undefined,
                  target: selectedCameraFollowTarget ? [...selectedCameraFollowTarget.position] : selectedCamera.target,
                  rotation: cameraLookAtRotation(
                    selectedCamera.position,
                    selectedCameraFollowTarget ? selectedCameraFollowTarget.position : selectedCamera.target,
                  ),
                })}
              >
                固定点
              </button>
              <button
                className={cn(
                  'h-7 rounded-[6px] text-[12px] text-[var(--nomi-ink-60)] transition hover:bg-[var(--nomi-paper)] hover:text-[var(--nomi-ink)] disabled:opacity-50',
                  selectedCamera.followTargetId && 'bg-[var(--nomi-paper)] text-[var(--nomi-ink)] shadow-sm',
                )}
                disabled={readOnly || state.objects.length === 0}
                type="button"
                onClick={() => {
                  const target = selectedCameraFollowTarget ?? state.objects[0]
                  if (!target) return
                  onCameraPatch(selectedCamera.id, {
                    followTargetId: target.id,
                    target: [...target.position],
                    rotation: cameraLookAtRotation(selectedCamera.position, target.position),
                  })
                }}
              >
                跟随节点
              </button>
            </div>
          </div>
          {selectedCamera.followTargetId ? (
            <label className="grid gap-1">
              <span className="text-[11px] text-[var(--nomi-ink-60)]">跟随节点</span>
              <select
                className="h-8 rounded-[6px] border border-[var(--nomi-line)] bg-[var(--nomi-paper)] px-2 text-[12px] text-[var(--nomi-ink)] outline-none"
                disabled={readOnly || state.objects.length === 0}
                value={selectedCameraFollowTarget?.id ?? ''}
                onChange={(event) => {
                  const target = state.objects.find((object) => object.id === event.currentTarget.value)
                  if (!target) return
                  onCameraPatch(selectedCamera.id, {
                    followTargetId: target.id,
                    target: [...target.position],
                    rotation: cameraLookAtRotation(selectedCamera.position, target.position),
                  })
                }}
              >
                {state.objects.map((object) => (
                  <option key={object.id} value={object.id}>{object.name}</option>
                ))}
              </select>
            </label>
          ) : null}
          <VectorInputs
            label="拍摄目标 XYZ"
            value={selectedCameraTargetValue ?? selectedCamera.target}
            disabled={readOnly || Boolean(selectedCamera.followTargetId)}
            onChange={(target) => onCameraPatch(selectedCamera.id, {
              target,
              followTargetId: undefined,
              rotation: cameraLookAtRotation(selectedCamera.position, target),
            })}
          />
          <label className="grid gap-1">
            <span className="text-[11px] text-[var(--nomi-ink-60)]">画幅比例</span>
            <select
              className="h-8 rounded-[6px] border border-[var(--nomi-line)] bg-[var(--nomi-paper)] px-2 text-[12px] text-[var(--nomi-ink)] outline-none"
              disabled={readOnly}
              value={selectedCamera.aspectRatio}
              onChange={(event) => onCameraPatch(selectedCamera.id, { aspectRatio: event.currentTarget.value as Scene3DAspectRatio })}
            >
              {SCENE3D_ASPECT_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(['fov', 'near', 'far'] as const).map((field) => (
              <label key={field} className="grid gap-1">
                <span className="text-[11px] text-[var(--nomi-ink-60)]">{field.toUpperCase()}</span>
                <input
                  className="h-8 min-w-0 rounded-[6px] border border-[var(--nomi-line)] bg-[var(--nomi-paper)] px-2 text-[12px] text-[var(--nomi-ink)] outline-none"
                  disabled={readOnly}
                  min={field === 'fov' ? 12 : 0.01}
                  step={field === 'fov' ? 1 : 0.1}
                  type="number"
                  value={selectedCamera[field]}
                  onChange={(event) => onCameraPatch(selectedCamera.id, { [field]: Number(event.currentTarget.value) })}
                />
              </label>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-2 text-[12px] text-[var(--nomi-ink-60)]">
            <label htmlFor="scene3d-dark-mode">场景暗色</label>
            <Switch
              id="scene3d-dark-mode"
              checked={state.environment.darkMode}
              disabled={readOnly}
              onCheckedChange={(darkMode) => onEnvironmentPatch({
                darkMode,
                backgroundColor: darkMode ? SCENE3D_DARK_BACKGROUND : SCENE3D_LIGHT_BACKGROUND,
              })}
            />
          </div>
          <div className="flex items-center justify-between gap-2 text-[12px] text-[var(--nomi-ink-60)]">
            <label htmlFor="scene3d-show-grid">网格地面</label>
            <Switch
              id="scene3d-show-grid"
              checked={state.environment.showGrid}
              disabled={readOnly}
              onCheckedChange={(checked) => onEnvironmentPatch({ showGrid: checked })}
            />
          </div>
          <div className="flex items-center justify-between gap-2 text-[12px] text-[var(--nomi-ink-60)]">
            <label htmlFor="scene3d-show-axes">坐标轴</label>
            <Switch
              id="scene3d-show-axes"
              checked={state.environment.showAxes}
              disabled={readOnly}
              onCheckedChange={(checked) => onEnvironmentPatch({ showAxes: checked })}
            />
          </div>
          <div className="flex items-center justify-between gap-2 text-[12px] text-[var(--nomi-ink-60)]">
            <label htmlFor="scene3d-show-sky">天空背景</label>
            <Switch
              id="scene3d-show-sky"
              checked={state.environment.showSky}
              disabled={readOnly}
              onCheckedChange={(checked) => onEnvironmentPatch({ showSky: checked })}
            />
          </div>
          <ColorField
            label="背景颜色"
            value={state.environment.backgroundColor}
            disabled={readOnly}
            onChange={(backgroundColor) => onEnvironmentPatch({ backgroundColor })}
          />
        </div>
      )}
    </section>
  )
})
