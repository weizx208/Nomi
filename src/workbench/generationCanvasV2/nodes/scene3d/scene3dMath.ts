import * as THREE from 'three'
import {
  SCENE3D_ASPECT_RATIOS,
  type Scene3DAspectRatio,
  type Scene3DCamera,
  type Scene3DCaptureResult,
  type Scene3DState,
  type Scene3DVector3,
} from './scene3dTypes'
import {
  CAMERA_DEFAULT_TARGET,
  CAMERA_HELPER_FLAG,
  CAMERA_LENS_DEPTH_MAX_FACTOR,
  SCENE3D_GRID_FLAG,
} from './scene3dConstants'

export function vectorFromArray(value: Scene3DVector3): THREE.Vector3 {
  return new THREE.Vector3(value[0], value[1], value[2])
}

export function vectorToArray(value: THREE.Vector3): Scene3DVector3 {
  return [
    Number(value.x.toFixed(4)),
    Number(value.y.toFixed(4)),
    Number(value.z.toFixed(4)),
  ]
}

export function cameraLookAtRotation(position: Scene3DVector3, target: Scene3DVector3): Scene3DVector3 {
  const cameraObject = new THREE.Object3D()
  cameraObject.position.fromArray(position)
  cameraObject.lookAt(vectorFromArray(target))
  return eulerToArray(cameraObject.rotation)
}

export function levelEditorCameraRotation(position: Scene3DVector3, target: Scene3DVector3): Scene3DVector3 {
  const direction = vectorFromArray(target).sub(vectorFromArray(position))
  if (direction.lengthSq() < 0.000001) return [0, 0, 0]
  direction.normalize()
  const pitch = Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1))
  const yaw = Math.atan2(-direction.x, -direction.z)
  return [
    Number(pitch.toFixed(4)),
    Number(yaw.toFixed(4)),
    0,
  ]
}

export function applyEditorCameraPose(camera: THREE.Camera, editorCamera: Pick<Scene3DState['editorCamera'], 'position' | 'target'>): void {
  const rotation = levelEditorCameraRotation(editorCamera.position, editorCamera.target)
  camera.up.set(0, 1, 0)
  camera.position.fromArray(editorCamera.position)
  camera.rotation.set(rotation[0], rotation[1], rotation[2], 'YXZ')
  camera.updateMatrixWorld(true)
}

export function cameraViewPosition(cameraData: Scene3DCamera): THREE.Vector3 {
  const position = vectorFromArray(cameraData.position)
  const target = vectorFromArray(cameraData.target || CAMERA_DEFAULT_TARGET)
  const direction = target.clone().sub(position)
  const distance = direction.length()
  if (distance < 0.001) return position

  const depth = THREE.MathUtils.clamp(cameraData.lensDepth ?? 0, -100, 100) / 100
  if (Math.abs(depth) < 0.001) return position

  direction.normalize()
  const rawOffset = distance * CAMERA_LENS_DEPTH_MAX_FACTOR * depth
  const safeForwardOffset = Math.max(0, distance - Math.max(cameraData.near ?? 0.1, 0.1) - 0.2)
  const offset = depth > 0 ? Math.min(rawOffset, safeForwardOffset) : rawOffset
  return position.addScaledVector(direction, offset)
}

export function applySceneCameraPose(camera: THREE.Camera, cameraData: Scene3DCamera): void {
  if (camera instanceof THREE.PerspectiveCamera) {
    camera.fov = cameraData.fov
    camera.aspect = SCENE3D_ASPECT_RATIOS[cameraData.aspectRatio]
    camera.near = cameraData.near
    camera.far = cameraData.far
    camera.updateProjectionMatrix()
  }
  camera.position.copy(cameraViewPosition(cameraData))
  camera.lookAt(vectorFromArray(cameraData.target || CAMERA_DEFAULT_TARGET))
  camera.updateMatrixWorld(true)
}

export function editorCameraFromSceneCamera(cameraData: Scene3DCamera): Scene3DState['editorCamera'] {
  const target = cameraData.target || CAMERA_DEFAULT_TARGET
  return {
    position: [...cameraData.position],
    target: [...target],
    rotation: levelEditorCameraRotation(cameraData.position, target),
    mode: 'fly',
  }
}

export function eulerToArray(value: THREE.Euler): Scene3DVector3 {
  return [
    Number(value.x.toFixed(4)),
    Number(value.y.toFixed(4)),
    Number(value.z.toFixed(4)),
  ]
}

export function vectorAlmostEqual(a: Scene3DVector3, b: Scene3DVector3, epsilon = 0.002): boolean {
  return (
    Math.abs(a[0] - b[0]) <= epsilon &&
    Math.abs(a[1] - b[1]) <= epsilon &&
    Math.abs(a[2] - b[2]) <= epsilon
  )
}

export function radiansToDegrees(value: number): number {
  return Number(THREE.MathUtils.radToDeg(value).toFixed(1))
}

export function degreesToRadians(value: number): number {
  return Number(THREE.MathUtils.degToRad(value).toFixed(4))
}

export function aspectDimensions(aspectRatio: Scene3DAspectRatio): { width: number; height: number } {
  const ratio = SCENE3D_ASPECT_RATIOS[aspectRatio]
  const width = 1920
  return {
    width,
    height: Math.max(1, Math.round(width / ratio)),
  }
}

export function captureScene(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number,
  title: string,
  source: Scene3DCaptureResult['source'],
  hideGrid = false,
): Scene3DCaptureResult | null {
  const helpers: Array<{ object: THREE.Object3D; visible: boolean }> = []
  scene.traverse((object) => {
    if (object.userData?.[CAMERA_HELPER_FLAG] === true || (hideGrid && object.userData?.[SCENE3D_GRID_FLAG] === true)) {
      helpers.push({ object, visible: object.visible })
      object.visible = false
    }
  })

  const previousRenderTarget = gl.getRenderTarget()
  const renderTarget = new THREE.WebGLRenderTarget(width, height, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
  })
  renderTarget.texture.colorSpace = THREE.SRGBColorSpace

  try {
    gl.setRenderTarget(renderTarget)
    gl.clear()
    gl.render(scene, camera)

    const buffer = new Uint8Array(width * height * 4)
    gl.readRenderTargetPixels(renderTarget, 0, 0, width, height, buffer)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return null
    const imageData = context.createImageData(width, height)
    for (let y = 0; y < height; y += 1) {
      const sourceRow = (height - y - 1) * width * 4
      const targetRow = y * width * 4
      imageData.data.set(buffer.subarray(sourceRow, sourceRow + width * 4), targetRow)
    }
    context.putImageData(imageData, 0, 0)
    return {
      dataUrl: canvas.toDataURL('image/png'),
      width,
      height,
      title,
      source,
    }
  } finally {
    gl.setRenderTarget(previousRenderTarget)
    helpers.forEach((entry) => {
      entry.object.visible = entry.visible
    })
    renderTarget.dispose()
  }
}

export function cameraAimSpherical(camera: Scene3DCamera): THREE.Spherical {
  const direction = vectorFromArray(camera.target).sub(vectorFromArray(camera.position))
  if (direction.lengthSq() < 0.0001) direction.set(0, -0.2, 1)
  return new THREE.Spherical().setFromVector3(direction)
}
