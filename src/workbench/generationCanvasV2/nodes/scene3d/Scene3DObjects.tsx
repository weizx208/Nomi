import React from 'react'
import { type ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import { Text, TransformControls, useGLTF } from '@react-three/drei'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import * as THREE from 'three'
import {
  type Scene3DGeometry,
  type Scene3DObject,
  type Scene3DTransformMode,
  type Scene3DVector3,
} from './scene3dTypes'
import {
  CAMERA_HELPER_FLAG,
  CROWD_DETAILED_MODEL_LIMIT,
  CROWD_FOOT_RING_SEGMENTS,
  CROWD_INSTANCED_GEOMETRY_SEGMENTS,
  MANNEQUIN_FOOT_RING_COLOR,
  MANNEQUIN_MODEL_URL,
  OBJECT_GROUND_GUIDE_ELEVATION,
  applyMannequinSkeletonPose,
  crowdCount,
  crowdLocalOffset,
  crowdLocalOffsets,
  eulerToArray,
  mannequinFootRingRadius,
  mannequinLabelHeight,
  mannequinRoleLabel,
  normalizeMannequinModel,
  objectGroundFootprint,
  objectTransformAnchorPosition,
  objectVisualHalfHeight,
  pointerCaptureTarget,
  rememberMannequinRestPose,
  roleColorForIndex,
  vectorFromArray,
  vectorToArray,
} from './scene3dShared'
import {
  registerScene3DObjectRef,
  unregisterScene3DObjectRef,
} from './trajectory/trajectoryRuntimeStore'

export function Scene3DMeshGeometry({ geometry }: { geometry: Scene3DGeometry | undefined }): JSX.Element {
  if (geometry === 'sphere') return <sphereGeometry args={[0.55, 40, 24]} />
  if (geometry === 'cylinder') return <cylinderGeometry args={[0.46, 0.46, 1.1, 40]} />
  if (geometry === 'plane') return <planeGeometry args={[1, 1]} />
  return <boxGeometry args={[1, 1, 1]} />
}

export function ProceduralMannequin({ color }: { color: string }): JSX.Element {
  return (
    <group>
      <mesh position={[0, 0.41, 0]}>
        <sphereGeometry args={[0.09, 24, 16]} />
        <meshStandardMaterial color={color} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.11, 0.14, 0.4, 24]} />
        <meshStandardMaterial color={color} roughness={0.62} />
      </mesh>
      <mesh position={[-0.24, 0.2, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.032, 0.038, 0.36, 16]} />
        <meshStandardMaterial color={color} roughness={0.62} />
      </mesh>
      <mesh position={[0.24, 0.2, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.032, 0.038, 0.36, 16]} />
        <meshStandardMaterial color={color} roughness={0.62} />
      </mesh>
      <mesh position={[-0.075, -0.28, 0]}>
        <cylinderGeometry args={[0.038, 0.044, 0.46, 16]} />
        <meshStandardMaterial color={color} roughness={0.62} />
      </mesh>
      <mesh position={[0.075, -0.28, 0]}>
        <cylinderGeometry args={[0.038, 0.044, 0.46, 16]} />
        <meshStandardMaterial color={color} roughness={0.62} />
      </mesh>
    </group>
  )
}

type MannequinAssetBoundaryProps = {
  fallback: React.ReactNode
  children: React.ReactNode
}

export class MannequinAssetBoundary extends React.Component<MannequinAssetBoundaryProps, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(): void {}

  render(): React.ReactNode {
    if (this.state.failed) return this.props.fallback
    return this.props.children
  }
}

export function Mannequin({ color, pose }: { color: string; pose?: Record<string, Scene3DVector3> }): JSX.Element {
  const { scene } = useGLTF(MANNEQUIN_MODEL_URL)
  const model = React.useMemo(() => {
    const skeletonClone = cloneSkeleton(scene)
    rememberMannequinRestPose(skeletonClone)
    const cloned = normalizeMannequinModel(skeletonClone)
    const materials: THREE.Material[] = []
    cloned.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.castShadow = true
      object.receiveShadow = true
      object.frustumCulled = false
      const cloneMaterial = (material: THREE.Material) => {
        const nextMaterial = material.clone()
        materials.push(nextMaterial)
        return nextMaterial
      }
      object.material = Array.isArray(object.material)
        ? object.material.map(cloneMaterial)
        : cloneMaterial(object.material)
      if (object instanceof THREE.SkinnedMesh) {
        object.computeBoundingSphere()
      }
    })
    return { object: cloned, materials }
  }, [scene])

  React.useEffect(() => {
    const materials = model.materials
    return () => materials.forEach((material) => material.dispose())
  }, [model])

  React.useLayoutEffect(() => {
    model.materials.forEach((material) => {
      if ('color' in material && material.color instanceof THREE.Color) {
        material.color.set(color)
        material.needsUpdate = true
      }
    })
  }, [color, model.materials])

  React.useLayoutEffect(() => {
    applyMannequinSkeletonPose(model.object, pose)
  }, [model, pose])

  return <primitive object={model.object} />
}

useGLTF.preload(MANNEQUIN_MODEL_URL)

type CrowdInstancePart = {
  key: string
  geometry: 'sphere' | 'cylinder'
  position: Scene3DVector3
  rotation?: Scene3DVector3
  scale: Scene3DVector3
}

const CROWD_INSTANCE_PARTS: CrowdInstancePart[] = [
  { key: 'head', geometry: 'sphere', position: [0, 0.41, 0], scale: [0.09, 0.09, 0.09] },
  { key: 'torso', geometry: 'cylinder', position: [0, 0.12, 0], scale: [0.13, 0.4, 0.13] },
  { key: 'left-arm', geometry: 'cylinder', position: [-0.24, 0.2, 0], rotation: [0, 0, Math.PI / 2], scale: [0.036, 0.36, 0.036] },
  { key: 'right-arm', geometry: 'cylinder', position: [0.24, 0.2, 0], rotation: [0, 0, Math.PI / 2], scale: [0.036, 0.36, 0.036] },
  { key: 'left-leg', geometry: 'cylinder', position: [-0.075, -0.28, 0], scale: [0.041, 0.46, 0.041] },
  { key: 'right-leg', geometry: 'cylinder', position: [0.075, -0.28, 0], scale: [0.041, 0.46, 0.041] },
]

function InstancedMeshBatch({
  part,
  offsets,
  roleStartIndex,
}: {
  part: CrowdInstancePart
  offsets: THREE.Vector3[]
  roleStartIndex: number
}): JSX.Element {
  const meshRef = React.useRef<THREE.InstancedMesh>(null)
  const count = offsets.length
  const matrix = React.useMemo(() => new THREE.Matrix4(), [])
  const position = React.useMemo(() => new THREE.Vector3(), [])
  const rotation = React.useMemo(() => new THREE.Quaternion(), [])
  const scale = React.useMemo(() => new THREE.Vector3(), [])
  const color = React.useMemo(() => new THREE.Color(), [])

  React.useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    mesh.count = count
    offsets.forEach((offset, index) => {
      position.set(
        offset.x + part.position[0],
        offset.y + part.position[1],
        offset.z + part.position[2],
      )
      rotation.setFromEuler(new THREE.Euler(
        part.rotation?.[0] || 0,
        part.rotation?.[1] || 0,
        part.rotation?.[2] || 0,
      ))
      scale.fromArray(part.scale)
      matrix.compose(position, rotation, scale)
      mesh.setMatrixAt(index, matrix)
      mesh.setColorAt(index, color.set(roleColorForIndex(roleStartIndex + index)))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [color, count, matrix, offsets, part, position, roleStartIndex, rotation, scale])

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, Math.max(1, count)]} frustumCulled={false}>
      {part.geometry === 'sphere'
        ? <sphereGeometry args={[1, CROWD_INSTANCED_GEOMETRY_SEGMENTS, CROWD_INSTANCED_GEOMETRY_SEGMENTS]} />
        : <cylinderGeometry args={[1, 1, 1, CROWD_INSTANCED_GEOMETRY_SEGMENTS]} />}
      <meshStandardMaterial roughness={0.62} />
    </instancedMesh>
  )
}

function InstancedProceduralMannequinCrowd({
  object,
  roleStartIndex,
}: {
  object: Scene3DObject
  roleStartIndex: number
}): JSX.Element {
  const offsets = React.useMemo(() => crowdLocalOffsets(object), [
    object.crowdRows,
    object.crowdColumns,
    object.crowdSpacing,
    object.scale,
  ])

  return (
    <>
      {CROWD_INSTANCE_PARTS.map((part) => (
        <InstancedMeshBatch
          key={part.key}
          part={part}
          offsets={offsets}
          roleStartIndex={roleStartIndex}
        />
      ))}
    </>
  )
}

export function MannequinCrowd({
  object,
  roleStartIndex,
}: {
  object: Scene3DObject
  roleStartIndex: number
}): JSX.Element {
  const offsets = React.useMemo(() => crowdLocalOffsets(object), [
    object.crowdRows,
    object.crowdColumns,
    object.crowdSpacing,
    object.scale,
  ])

  if (offsets.length > CROWD_DETAILED_MODEL_LIMIT) {
    return <InstancedProceduralMannequinCrowd object={object} roleStartIndex={roleStartIndex} />
  }

  return (
    <>
      {offsets.map((offset, index) => (
        <group key={`${object.id}-member-${index}`} position={vectorToArray(offset)}>
          <Mannequin color={roleColorForIndex(roleStartIndex + index)} pose={object.pose} />
        </group>
      ))}
    </>
  )
}

export function ProceduralMannequinCrowd({
  object,
  roleStartIndex,
}: {
  object: Scene3DObject
  roleStartIndex: number
}): JSX.Element {
  return <InstancedProceduralMannequinCrowd object={object} roleStartIndex={roleStartIndex} />
}

export function LightObject({ object }: { object: Scene3DObject }): JSX.Element {
  const intensity = object.lightIntensity ?? 2
  const color = object.lightColor || '#ffffff'
  if (object.lightType === 'directional') {
    return <directionalLight color={color} intensity={intensity} position={[0, 0, 0]} />
  }
  if (object.lightType === 'spot') {
    return <spotLight color={color} intensity={intensity} angle={0.45} penumbra={0.4} />
  }
  return <pointLight color={color} intensity={intensity} distance={12} />
}

function MannequinRoleLabel({
  position,
  label,
  runtimeTargetId,
  runtimeOffset,
}: {
  position: Scene3DVector3
  label: string
  runtimeTargetId?: string
  runtimeOffset?: THREE.Vector3
}): JSX.Element {
  const ref = React.useRef<THREE.Group>(null)
  const { camera } = useThree()
  const backgroundWidth = React.useMemo(() => Math.max(0.72, label.length * 0.24 + 0.18), [label])

  React.useEffect(() => {
    if (!runtimeTargetId) return undefined
    registerScene3DObjectRef(runtimeTargetId, ref as React.RefObject<THREE.Object3D>, {
      positionOffset: runtimeOffset,
      followTangent: false,
    })
    return () => unregisterScene3DObjectRef(runtimeTargetId, ref as React.RefObject<THREE.Object3D>)
  }, [runtimeOffset, runtimeTargetId])

  useFrame(() => {
    ref.current?.quaternion.copy(camera.quaternion)
  })

  return (
    <group
      ref={ref}
      position={position}
      raycast={() => null}
      userData={{ [CAMERA_HELPER_FLAG]: true }}
    >
      <mesh position={[0, 0, -0.012]} raycast={() => null} renderOrder={7}>
        <planeGeometry args={[backgroundWidth, 0.38]} />
        <meshBasicMaterial
          color="#111827"
          depthTest={false}
          depthWrite={false}
          opacity={0.72}
          transparent
          toneMapped={false}
        />
      </mesh>
      <Text
        anchorX="center"
        anchorY="middle"
        color="#ffffff"
        fontSize={0.28}
        fontWeight={700}
        frustumCulled={false}
        outlineColor="#111827"
        outlineOpacity={0.55}
        outlineWidth={0.012}
        raycast={() => null}
        renderOrder={8}
      >
        {label}
      </Text>
    </group>
  )
}

function singleMannequinLabelPosition(object: Scene3DObject): Scene3DVector3 {
  return [
    object.position[0],
    object.position[1] + mannequinLabelHeight(object),
    object.position[2],
  ]
}

function crowdLabelPositions(object: Scene3DObject): Scene3DVector3[] {
  const count = crowdCount(object)
  const matrix = new THREE.Matrix4()
  const rotation = new THREE.Euler(object.rotation[0], object.rotation[1], object.rotation[2])
  matrix.compose(
    vectorFromArray(object.position),
    new THREE.Quaternion().setFromEuler(rotation),
    vectorFromArray(object.scale),
  )
  const scaleY = Math.max(0.001, Math.abs(object.scale[1] || 1))
  const localLabelY = mannequinLabelHeight(object) / scaleY
  return Array.from({ length: count }, (_, index) => {
    const position = crowdLocalOffset(object, index)
    position.y = localLabelY
    return vectorToArray(position.applyMatrix4(matrix))
  })
}

function FootRing({
  position,
  radius,
  runtimeTargetId,
}: {
  position: Scene3DVector3
  radius: number
  runtimeTargetId?: string
}): JSX.Element {
  const ref = React.useRef<THREE.Mesh>(null)
  const runtimeOffset = React.useMemo(() => new THREE.Vector3(0, OBJECT_GROUND_GUIDE_ELEVATION, 0), [])

  React.useEffect(() => {
    if (!runtimeTargetId) return undefined
    registerScene3DObjectRef(runtimeTargetId, ref as React.RefObject<THREE.Object3D>, {
      positionOffset: runtimeOffset,
      followTangent: false,
    })
    return () => unregisterScene3DObjectRef(runtimeTargetId, ref as React.RefObject<THREE.Object3D>)
  }, [runtimeOffset, runtimeTargetId])

  return (
    <mesh
      ref={ref}
      position={[position[0], OBJECT_GROUND_GUIDE_ELEVATION, position[2]]}
      raycast={() => null}
      renderOrder={3}
      rotation={[-Math.PI / 2, 0, 0]}
      userData={{ [CAMERA_HELPER_FLAG]: true }}
    >
      <ringGeometry args={[radius * 0.92, radius, 72]} />
      <meshBasicMaterial
        color={MANNEQUIN_FOOT_RING_COLOR}
        depthWrite={false}
        opacity={0.8}
        side={THREE.DoubleSide}
        transparent
        toneMapped={false}
      />
    </mesh>
  )
}

function InstancedFootRings({
  positions,
  radius,
}: {
  positions: Scene3DVector3[]
  radius: number
}): JSX.Element {
  const meshRef = React.useRef<THREE.InstancedMesh>(null)
  const count = positions.length
  const matrix = React.useMemo(() => new THREE.Matrix4(), [])
  const position = React.useMemo(() => new THREE.Vector3(), [])
  const rotation = React.useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), [])
  const scale = React.useMemo(() => new THREE.Vector3(1, 1, 1), [])

  React.useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    mesh.count = count
    positions.forEach((entry, index) => {
      position.set(entry[0], OBJECT_GROUND_GUIDE_ELEVATION, entry[2])
      matrix.compose(position, rotation, scale)
      mesh.setMatrixAt(index, matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [count, matrix, position, positions, rotation, scale])

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, Math.max(1, count)]}
      raycast={() => null}
      renderOrder={3}
      userData={{ [CAMERA_HELPER_FLAG]: true }}
    >
      <ringGeometry args={[radius * 0.92, radius, CROWD_FOOT_RING_SEGMENTS]} />
      <meshBasicMaterial
        color={MANNEQUIN_FOOT_RING_COLOR}
        depthWrite={false}
        opacity={0.8}
        side={THREE.DoubleSide}
        transparent
        toneMapped={false}
      />
    </instancedMesh>
  )
}

function MannequinFootRings({ object }: { object: Scene3DObject }): JSX.Element | null {
  const baseRadius = mannequinFootRingRadius(object)
  const positions = React.useMemo(() => {
    if (object.type !== 'mannequinCrowd') return []
    const matrix = new THREE.Matrix4()
    matrix.compose(
      vectorFromArray(object.position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(object.rotation[0], object.rotation[1], object.rotation[2])),
      vectorFromArray(object.scale),
    )
    return Array.from({ length: crowdCount(object) }, (_, index) => (
      vectorToArray(crowdLocalOffset(object, index).applyMatrix4(matrix))
    ))
  }, [
    object.crowdRows,
    object.crowdColumns,
    object.crowdSpacing,
    object.position,
    object.rotation,
    object.scale,
  ])

  if (object.type !== 'mannequin' && object.type !== 'mannequinCrowd') return null

  if (object.type === 'mannequin') {
    return <FootRing position={[object.position[0], 0, object.position[2]]} radius={baseRadius} runtimeTargetId={object.id} />
  }

  return <InstancedFootRings positions={positions} radius={baseRadius} />
}

export const SceneObjectView = React.memo(function SceneObjectView({
  object,
  selected,
  readOnly,
  interactionDisabled,
  transformMode,
  orbitControlsActive,
  navigationLockedRef,
  roleLabel,
  roleStartIndex,
  onSelectObject,
  onFocusObject,
  onTransformStart,
  onTransformEnd,
  onObjectPatch,
}: {
  object: Scene3DObject
  selected: boolean
  readOnly: boolean
  interactionDisabled?: boolean
  transformMode: Scene3DTransformMode
  orbitControlsActive: boolean
  navigationLockedRef: React.MutableRefObject<boolean>
  roleLabel?: string
  roleStartIndex?: number
  onSelectObject: (id: string) => void
  onFocusObject: (id: string) => void
  onTransformStart: () => void
  onTransformEnd: () => void
  onObjectPatch: (id: string, patch: Partial<Scene3DObject>) => void
}): JSX.Element {
  const visualRef = React.useRef<THREE.Group>(null!) as React.MutableRefObject<THREE.Group>
  const anchorRef = React.useRef<THREE.Group>(null!) as React.MutableRefObject<THREE.Group>
  const transformRef = React.useRef<any>(null)
  const transformDraggingRef = React.useRef(false)
  const orbitControlsActiveRef = React.useRef(orbitControlsActive)
  const { controls } = useThree()
  const anchorPosition = React.useMemo(() => objectTransformAnchorPosition(object), [
    object.geometry,
    object.lightType,
    object.position,
    object.scale,
    object.type,
  ])
  const crowdHitboxSize = React.useMemo(() => {
    if (object.type !== 'mannequinCrowd') return null
    const footprint = objectGroundFootprint(object)
    return {
      width: Math.max(0.2, footprint.width / Math.max(0.001, Math.abs(object.scale[0] || 1))),
      depth: Math.max(0.2, footprint.depth / Math.max(0.001, Math.abs(object.scale[2] || 1))),
    }
  }, [
    object.crowdRows,
    object.crowdColumns,
    object.crowdSpacing,
    object.geometry,
    object.scale,
    object.type,
  ])
  const crowdRoleLabelPositions = React.useMemo(
    () => (object.type === 'mannequinCrowd' ? crowdLabelPositions(object) : []),
    [
      object.crowdRows,
      object.crowdColumns,
      object.crowdSpacing,
      object.position,
      object.rotation,
      object.scale,
      object.type,
    ],
  )
  const trajectoryPositionOffset = React.useMemo(
    () => new THREE.Vector3(0, objectVisualHalfHeight(object), 0),
    [object.geometry, object.scale, object.type],
  )
  const singleRoleLabelRuntimeOffset = React.useMemo(() => (
    object.type === 'mannequin'
      ? new THREE.Vector3(0, objectVisualHalfHeight(object) + mannequinLabelHeight(object), 0)
      : undefined
  ), [object.geometry, object.scale, object.type])

  React.useEffect(() => {
    registerScene3DObjectRef(object.id, visualRef, {
      positionOffset: trajectoryPositionOffset,
      followTangent: true,
    })
    return () => unregisterScene3DObjectRef(object.id, visualRef)
  }, [object.id, trajectoryPositionOffset])

  const handleObjectChange = React.useCallback(() => {
    if (!anchorRef.current) return
    const nextScale = vectorToArray(anchorRef.current.scale)
    const nextPosition: Scene3DVector3 = [
      Number(anchorRef.current.position.x.toFixed(4)),
      Number((anchorRef.current.position.y + objectVisualHalfHeight(object, nextScale)).toFixed(4)),
      Number(anchorRef.current.position.z.toFixed(4)),
    ]
    const nextRotation = eulerToArray(anchorRef.current.rotation)
    if (visualRef.current) {
      visualRef.current.position.fromArray(nextPosition)
      visualRef.current.rotation.copy(anchorRef.current.rotation)
      visualRef.current.scale.copy(anchorRef.current.scale)
    }
    onObjectPatch(object.id, {
      position: nextPosition,
      rotation: nextRotation,
      scale: nextScale,
    })
  }, [object, onObjectPatch])

  React.useLayoutEffect(() => {
    orbitControlsActiveRef.current = orbitControlsActive
    if (!orbitControlsActive && controls && 'enabled' in controls && !transformDraggingRef.current) {
      ;(controls as { enabled: boolean }).enabled = false
    }
  }, [controls, orbitControlsActive])

  React.useLayoutEffect(() => {
    if (!anchorRef.current || transformDraggingRef.current) return
    anchorRef.current.position.fromArray(anchorPosition)
    anchorRef.current.rotation.fromArray(object.rotation)
    anchorRef.current.scale.fromArray(object.scale)
  }, [anchorPosition, object.rotation, object.scale])

  React.useEffect(() => {
    const tc = transformRef.current
    if (!tc) return
    const handler = (event: any) => {
      const dragging = Boolean(event.value)
      const wasDragging = transformDraggingRef.current
      transformDraggingRef.current = dragging
      navigationLockedRef.current = dragging
      if (dragging && !wasDragging) {
        orbitControlsActiveRef.current = false
        onTransformStart()
      }
      if (controls && 'enabled' in controls) {
        ;(controls as { enabled: boolean }).enabled = dragging ? false : orbitControlsActiveRef.current
      }
    }
    tc.addEventListener('dragging-changed', handler)
    return () => {
      if (transformDraggingRef.current) {
        navigationLockedRef.current = false
        transformDraggingRef.current = false
        onTransformEnd()
      }
      tc.removeEventListener('dragging-changed', handler)
    }
  }, [controls, navigationLockedRef, onTransformEnd, onTransformStart, selected])

  const handleTransformMouseDown = React.useCallback(() => {
    orbitControlsActiveRef.current = false
    navigationLockedRef.current = true
    onTransformStart()
    if (controls && 'enabled' in controls) {
      ;(controls as { enabled: boolean }).enabled = false
    }
  }, [controls, navigationLockedRef, onTransformStart])

  const handleTransformMouseUp = React.useCallback(() => {
    navigationLockedRef.current = false
    onTransformEnd()
    if (controls && 'enabled' in controls) {
      ;(controls as { enabled: boolean }).enabled = orbitControlsActiveRef.current
    }
  }, [controls, navigationLockedRef, onTransformEnd])

  const group = (
    <group
      ref={visualRef}
      visible={object.visible}
      position={object.position}
      rotation={object.rotation}
      scale={object.scale}
      onPointerDown={interactionDisabled ? undefined : (event) => {
        event.stopPropagation()
        onSelectObject(object.id)
      }}
      onDoubleClick={interactionDisabled ? undefined : (event) => {
        event.stopPropagation()
        onSelectObject(object.id)
        onFocusObject(object.id)
      }}
    >
      {object.type === 'mannequin' ? (
        <MannequinAssetBoundary fallback={<ProceduralMannequin color={object.color || '#808080'} />}>
          <React.Suspense fallback={<ProceduralMannequin color={object.color || '#808080'} />}>
            <Mannequin color={object.color || '#808080'} pose={object.pose} />
          </React.Suspense>
        </MannequinAssetBoundary>
      ) : object.type === 'mannequinCrowd' ? (
        <MannequinAssetBoundary fallback={<ProceduralMannequinCrowd object={object} roleStartIndex={roleStartIndex || 0} />}>
          <React.Suspense fallback={<ProceduralMannequinCrowd object={object} roleStartIndex={roleStartIndex || 0} />}>
            <MannequinCrowd object={object} roleStartIndex={roleStartIndex || 0} />
          </React.Suspense>
        </MannequinAssetBoundary>
      ) : object.type === 'light' ? (
        <>
          <LightObject object={object} />
          <mesh>
            <sphereGeometry args={[0.12, 18, 12]} />
            <meshBasicMaterial color={object.lightColor || '#ffffff'} toneMapped={false} />
          </mesh>
        </>
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
      {crowdHitboxSize ? (
        <mesh>
          <boxGeometry args={[
            crowdHitboxSize.width,
            1,
            crowdHitboxSize.depth,
          ]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ) : null}
    </group>
  )

  return (
    <>
      {selected ? <MannequinFootRings object={object} /> : null}
      {object.type === 'mannequin' && roleLabel ? (
        <MannequinRoleLabel
          position={singleMannequinLabelPosition(object)}
          label={roleLabel}
          runtimeTargetId={object.id}
          runtimeOffset={singleRoleLabelRuntimeOffset}
        />
      ) : null}
      {object.type === 'mannequinCrowd' && roleStartIndex !== undefined
        ? crowdRoleLabelPositions.map((position, index) => (
          <MannequinRoleLabel
            key={`${object.id}-role-${index}`}
            position={position}
            label={mannequinRoleLabel(roleStartIndex + index)}
          />
        ))
        : null}
      <group ref={anchorRef} position={anchorPosition} rotation={object.rotation} scale={object.scale} />
      {group}
      {selected && !readOnly ? (
        <TransformControls
          ref={transformRef}
          object={anchorRef}
          mode={transformMode}
          onMouseDown={handleTransformMouseDown}
          onMouseUp={handleTransformMouseUp}
          onObjectChange={handleObjectChange}
        />
      ) : null}
    </>
  )
})
