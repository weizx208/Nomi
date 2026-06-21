import React from 'react'
import { type ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import {
  SCENE3D_ASPECT_RATIOS,
  type Scene3DCamera,
  type Scene3DVector3,
} from './scene3dTypes'
import {
  CAMERA_AIM_FEEDBACK_LENGTH,
  CAMERA_AIM_HANDLE_DISTANCE,
  CAMERA_AIM_HANDLE_POSITIONS,
  CAMERA_DEFAULT_TARGET,
  CAMERA_HELPER_FLAG,
  CAMERA_HELPER_VISUAL_FAR,
  CAMERA_MARKER_ACCENT_COLOR,
  CAMERA_MARKER_COLOR,
  type PointerCaptureTarget,
  cameraAimSpherical,
  cameraLookAtRotation,
  pointerCaptureTarget,
  vectorFromArray,
  vectorToArray,
} from './scene3dShared'
import {
  registerScene3DObjectRef,
  unregisterScene3DObjectRef,
} from './trajectory/trajectoryRuntimeStore'

function CameraFrustumLines({
  cameraData,
  selected,
}: {
  cameraData: Scene3DCamera
  selected: boolean
}): JSX.Element {
  const positions = React.useMemo(() => {
    const distance = Math.min(cameraData.far, Math.max(cameraData.near + 0.1, CAMERA_HELPER_VISUAL_FAR))
    const aspect = SCENE3D_ASPECT_RATIOS[cameraData.aspectRatio]
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(cameraData.fov) / 2) * distance
    const halfWidth = halfHeight * aspect
    const origin: Scene3DVector3 = [0, 0, 0]
    const topLeft: Scene3DVector3 = [-halfWidth, halfHeight, distance]
    const topRight: Scene3DVector3 = [halfWidth, halfHeight, distance]
    const bottomRight: Scene3DVector3 = [halfWidth, -halfHeight, distance]
    const bottomLeft: Scene3DVector3 = [-halfWidth, -halfHeight, distance]
    const segments = [
      origin, topLeft,
      origin, topRight,
      origin, bottomRight,
      origin, bottomLeft,
      topLeft, topRight,
      topRight, bottomRight,
      bottomRight, bottomLeft,
      bottomLeft, topLeft,
    ]
    return new Float32Array(segments.flat())
  }, [cameraData.aspectRatio, cameraData.far, cameraData.fov, cameraData.near])

  return (
    <lineSegments frustumCulled={false} raycast={() => null} userData={{ [CAMERA_HELPER_FLAG]: true }}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial
        color={selected ? '#facc15' : '#64748b'}
        opacity={selected ? 0.9 : 0.56}
        transparent
        toneMapped={false}
      />
    </lineSegments>
  )
}

function CameraTargetFeedback(): JSX.Element {
  const positions = React.useMemo(() => new Float32Array([
    0,
    0,
    0,
    0,
    0,
    CAMERA_AIM_FEEDBACK_LENGTH,
  ]), [])

  return (
    <>
      <lineSegments frustumCulled={false} raycast={() => null} userData={{ [CAMERA_HELPER_FLAG]: true }}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#facc15" opacity={0.62} transparent toneMapped={false} />
      </lineSegments>
      <mesh position={[0, 0, CAMERA_AIM_FEEDBACK_LENGTH]} raycast={() => null} userData={{ [CAMERA_HELPER_FLAG]: true }}>
        <sphereGeometry args={[0.055, 18, 12]} />
        <meshBasicMaterial color="#facc15" toneMapped={false} />
      </mesh>
    </>
  )
}

export const CameraHelperView = React.memo(function CameraHelperView({
  cameraData,
  selected,
  readOnly,
  interactionDisabled,
  positionLocked,
  orbitControlsActive,
  navigationLockedRef,
  onSelectCamera,
  onFocusCamera,
  onTransformStart,
  onTransformEnd,
  onCameraPatch,
}: {
  cameraData: Scene3DCamera
  selected: boolean
  readOnly: boolean
  interactionDisabled?: boolean
  positionLocked?: boolean
  orbitControlsActive: boolean
  navigationLockedRef: React.MutableRefObject<boolean>
  onSelectCamera: (id: string) => void
  onFocusCamera: (id: string) => void
  onTransformStart: () => void
  onTransformEnd: () => void
  onCameraPatch: (id: string, patch: Partial<Scene3DCamera>) => void
}): JSX.Element {
  const markerRef = React.useRef<THREE.Group>(null)
  const positionDraggingRef = React.useRef(false)
  const aimDraggingRef = React.useRef<{
    pointerId: number
    startX: number
    startY: number
    theta: number
    phi: number
    radius: number
    target: PointerCaptureTarget | null
  } | null>(null)
  const controlsEnabledBeforeDragRef = React.useRef<boolean | null>(null)
  const orbitControlsActiveRef = React.useRef(orbitControlsActive)
  const dragPlaneRef = React.useRef(new THREE.Plane())
  const dragHitRef = React.useRef(new THREE.Vector3())
  const dragOffsetRef = React.useRef(new THREE.Vector3())
  const { controls } = useThree()
  const target = cameraData.target || CAMERA_DEFAULT_TARGET
  const targetRef = React.useRef<Scene3DVector3>(target)
  const cameraPosition = React.useMemo(() => vectorFromArray(cameraData.position), [cameraData.position])
  const cameraRotation = React.useMemo(
    () => cameraLookAtRotation(cameraData.position, target),
    [cameraData.position, target],
  )

  React.useLayoutEffect(() => {
    targetRef.current = target
  }, [target])

  useFrame(() => {
    const marker = markerRef.current
    if (!marker) return
    const nextTarget = vectorFromArray(targetRef.current)
    if (marker.position.distanceToSquared(nextTarget) < 0.000001) return
    marker.lookAt(nextTarget)
  })

  React.useEffect(() => {
    const runtimeRef = markerRef as React.RefObject<THREE.Object3D>
    registerScene3DObjectRef(cameraData.id, runtimeRef, { followTangent: false })
    return () => unregisterScene3DObjectRef(cameraData.id, runtimeRef)
  }, [cameraData.id])

  React.useEffect(() => () => {
    navigationLockedRef.current = false
    if (controls && 'enabled' in controls && controlsEnabledBeforeDragRef.current !== null) {
      ;(controls as { enabled: boolean }).enabled = orbitControlsActiveRef.current
        ? controlsEnabledBeforeDragRef.current
        : false
    }
  }, [controls, navigationLockedRef])

  React.useLayoutEffect(() => {
    orbitControlsActiveRef.current = orbitControlsActive
    if (!orbitControlsActive && controls && 'enabled' in controls && controlsEnabledBeforeDragRef.current === null) {
      ;(controls as { enabled: boolean }).enabled = false
    }
  }, [controls, orbitControlsActive])

  const setSceneControlsDragging = React.useCallback((dragging: boolean) => {
    navigationLockedRef.current = dragging
    if (!controls || !('enabled' in controls)) return
    const orbitControls = controls as { enabled: boolean }
    if (dragging) {
      if (controlsEnabledBeforeDragRef.current === null) {
        controlsEnabledBeforeDragRef.current = orbitControls.enabled
      }
      orbitControls.enabled = false
      return
    }
    if (controlsEnabledBeforeDragRef.current !== null) {
      orbitControls.enabled = orbitControlsActiveRef.current ? controlsEnabledBeforeDragRef.current : false
      controlsEnabledBeforeDragRef.current = null
    }
  }, [controls, navigationLockedRef])

  const stopScenePointerEvent = React.useCallback((event: ThreeEvent<PointerEvent>) => {
    event.nativeEvent.preventDefault()
    event.nativeEvent.stopPropagation()
    event.nativeEvent.stopImmediatePropagation()
    event.stopPropagation()
  }, [])

  const updatePositionFromEvent = React.useCallback((event: ThreeEvent<PointerEvent>) => {
    const hit = event.ray.intersectPlane(dragPlaneRef.current, dragHitRef.current)
    if (!hit) return
    const nextPosition = vectorToArray(hit.clone().add(dragOffsetRef.current))
    onCameraPatch(cameraData.id, {
      position: nextPosition,
      rotation: cameraLookAtRotation(nextPosition, target),
    })
  }, [cameraData.id, onCameraPatch, target])

  const handlePositionPointerDown = React.useCallback((event: ThreeEvent<PointerEvent>) => {
    stopScenePointerEvent(event)
    onSelectCamera(cameraData.id)
    orbitControlsActiveRef.current = false
    if (readOnly || positionLocked) return
    onTransformStart()
    setSceneControlsDragging(true)
    const currentPosition = markerRef.current?.position.clone() ?? cameraPosition
    const planeNormal = new THREE.Vector3()
    event.camera.getWorldDirection(planeNormal)
    planeNormal.normalize()
    dragPlaneRef.current.setFromNormalAndCoplanarPoint(planeNormal, currentPosition)
    const hit = event.ray.intersectPlane(dragPlaneRef.current, dragHitRef.current)
    dragOffsetRef.current.copy(hit ? currentPosition.clone().sub(hit) : new THREE.Vector3())
    positionDraggingRef.current = true
    pointerCaptureTarget(event.target)?.setPointerCapture?.(event.pointerId)
  }, [cameraData.id, cameraPosition, onSelectCamera, onTransformStart, positionLocked, readOnly, setSceneControlsDragging, stopScenePointerEvent])

  const handlePositionPointerMove = React.useCallback((event: ThreeEvent<PointerEvent>) => {
    if (!positionDraggingRef.current || readOnly) return
    stopScenePointerEvent(event)
    updatePositionFromEvent(event)
  }, [readOnly, stopScenePointerEvent, updatePositionFromEvent])

  const stopCameraDrag = React.useCallback((event: ThreeEvent<PointerEvent>) => {
    if (!positionDraggingRef.current) return
    stopScenePointerEvent(event)
    positionDraggingRef.current = false
    setSceneControlsDragging(false)
    onTransformEnd()
    pointerCaptureTarget(event.target)?.releasePointerCapture?.(event.pointerId)
  }, [onTransformEnd, setSceneControlsDragging, stopScenePointerEvent])

  const updateAimFromDrag = React.useCallback((drag: NonNullable<typeof aimDraggingRef.current>, dx: number, dy: number, fine = false) => {
    const sensitivity = fine ? 0.003 : 0.008
    const phi = THREE.MathUtils.clamp(drag.phi - dy * sensitivity, 0.08, Math.PI - 0.08)
    const theta = drag.theta + dx * sensitivity
    const position = markerRef.current?.position.clone() ?? vectorFromArray(cameraData.position)
    const direction = new THREE.Vector3().setFromSpherical(new THREE.Spherical(drag.radius, phi, theta))
    const nextTarget = vectorToArray(position.clone().add(direction))
    const positionArray = vectorToArray(position)
    onCameraPatch(cameraData.id, {
      target: nextTarget,
      rotation: cameraLookAtRotation(positionArray, nextTarget),
    })
  }, [cameraData.id, cameraData.position, onCameraPatch])

  const handleAimPointerDown = React.useCallback((event: ThreeEvent<PointerEvent>) => {
    stopScenePointerEvent(event)
    onSelectCamera(cameraData.id)
    orbitControlsActiveRef.current = false
    if (readOnly) return
    onTransformStart()
    const currentPosition = markerRef.current ? vectorToArray(markerRef.current.position) : cameraData.position
    const spherical = cameraAimSpherical({ ...cameraData, position: currentPosition })
    aimDraggingRef.current = {
      pointerId: event.pointerId,
      startX: event.nativeEvent.clientX,
      startY: event.nativeEvent.clientY,
      theta: spherical.theta,
      phi: spherical.phi,
      radius: Math.max(0.75, spherical.radius),
      target: pointerCaptureTarget(event.target),
    }
    setSceneControlsDragging(true)
    pointerCaptureTarget(event.target)?.setPointerCapture?.(event.pointerId)
  }, [cameraData, onSelectCamera, onTransformStart, readOnly, setSceneControlsDragging, stopScenePointerEvent])

  const handleAimPointerMove = React.useCallback((event: ThreeEvent<PointerEvent>) => {
    const drag = aimDraggingRef.current
    if (!drag || drag.pointerId !== event.pointerId || readOnly) return
    stopScenePointerEvent(event)
    updateAimFromDrag(
      drag,
      event.nativeEvent.clientX - drag.startX,
      event.nativeEvent.clientY - drag.startY,
      event.nativeEvent.shiftKey,
    )
  }, [readOnly, stopScenePointerEvent, updateAimFromDrag])

  const stopAimDrag = React.useCallback((event: ThreeEvent<PointerEvent>) => {
    const drag = aimDraggingRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    stopScenePointerEvent(event)
    aimDraggingRef.current = null
    setSceneControlsDragging(false)
    onTransformEnd()
    pointerCaptureTarget(event.target)?.releasePointerCapture?.(event.pointerId)
  }, [onTransformEnd, setSceneControlsDragging, stopScenePointerEvent])

  React.useEffect(() => {
    const stopNativePointerEvent = (event: PointerEvent) => {
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
    }

    const handleWindowPointerMove = (event: PointerEvent) => {
      const drag = aimDraggingRef.current
      if (!drag || drag.pointerId !== event.pointerId || readOnly) return
      stopNativePointerEvent(event)
      updateAimFromDrag(
        drag,
        event.clientX - drag.startX,
        event.clientY - drag.startY,
        event.shiftKey,
      )
    }

    const stopWindowAimDrag = (event: PointerEvent) => {
      const drag = aimDraggingRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      stopNativePointerEvent(event)
      aimDraggingRef.current = null
      setSceneControlsDragging(false)
      onTransformEnd()
      drag.target?.releasePointerCapture?.(drag.pointerId)
    }

    window.addEventListener('pointermove', handleWindowPointerMove, { capture: true })
    window.addEventListener('pointerup', stopWindowAimDrag, { capture: true })
    window.addEventListener('pointercancel', stopWindowAimDrag, { capture: true })
    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove, { capture: true })
      window.removeEventListener('pointerup', stopWindowAimDrag, { capture: true })
      window.removeEventListener('pointercancel', stopWindowAimDrag, { capture: true })
    }
  }, [onTransformEnd, readOnly, setSceneControlsDragging, updateAimFromDrag])

  const positionInteractionDisabled = interactionDisabled || positionLocked
  const lockedPositionRaycast = React.useCallback(() => null, [])
  const lockedRaycastProps = positionInteractionDisabled ? { raycast: lockedPositionRaycast } : null

  const marker = (
    <group
      ref={markerRef}
      userData={{ [CAMERA_HELPER_FLAG]: true }}
      visible={cameraData.visible}
      position={cameraData.position}
      rotation={cameraRotation}
      onPointerDown={positionInteractionDisabled ? undefined : handlePositionPointerDown}
      onPointerMove={positionInteractionDisabled ? undefined : handlePositionPointerMove}
      onPointerUp={positionInteractionDisabled ? undefined : stopCameraDrag}
      onPointerCancel={positionInteractionDisabled ? undefined : stopCameraDrag}
      onDoubleClick={positionInteractionDisabled ? undefined : (event) => {
        event.stopPropagation()
        onSelectCamera(cameraData.id)
        onFocusCamera(cameraData.id)
      }}
    >
      <CameraFrustumLines cameraData={cameraData} selected={selected} />
      {selected && !readOnly ? (
        <group
          position={[0, 0, -CAMERA_AIM_HANDLE_DISTANCE]}
          onPointerDown={handleAimPointerDown}
          onPointerMove={handleAimPointerMove}
          onPointerUp={stopAimDrag}
          onPointerCancel={stopAimDrag}
        >
          <lineSegments frustumCulled={false} raycast={() => null}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[CAMERA_AIM_HANDLE_POSITIONS, 3]} />
            </bufferGeometry>
            <lineBasicMaterial color="#facc15" opacity={0.8} transparent toneMapped={false} />
          </lineSegments>
          <mesh>
            <sphereGeometry args={[0.075, 18, 12]} />
            <meshBasicMaterial color="#facc15" toneMapped={false} />
          </mesh>
        </group>
      ) : null}
      {selected ? <CameraTargetFeedback /> : null}
      <mesh {...lockedRaycastProps}>
        <sphereGeometry args={[0.38, 16, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh {...lockedRaycastProps}>
        <boxGeometry args={[0.14, 0.09, 0.08]} />
        <meshBasicMaterial
          color={selected ? '#facc15' : CAMERA_MARKER_COLOR}
          depthWrite={false}
          opacity={selected ? 0.92 : 0.58}
          transparent
          toneMapped={false}
        />
      </mesh>
      <mesh
        position={[0, 0, 0.12]}
        rotation={[Math.PI / 2, 0, 0]}
        {...lockedRaycastProps}
      >
        <coneGeometry args={[0.045, 0.09, 18]} />
        <meshBasicMaterial
          color={selected ? '#facc15' : CAMERA_MARKER_ACCENT_COLOR}
          depthWrite={false}
          opacity={selected ? 0.92 : 0.58}
          transparent
          toneMapped={false}
        />
      </mesh>
    </group>
  )

  return (
    <>
      {marker}
    </>
  )
})
