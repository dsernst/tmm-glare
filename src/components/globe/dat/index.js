/* eslint-disable dot-notation, no-invalid-this */
/**
 * dat.globe Javascript WebGL Globe Toolkit
 * http://dataarts.github.com/dat.globe
 *
 * Copyright 2011 Data Arts Team, Google Creative Lab
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

import THREE from 'three'
import Shaders from './shaders'

const DAT = {}
const EARTH_RADIUS = 100

DAT.Globe = function Globe(container, opts = {}) {

  const colorFn = opts.colorFn || (x => {
    const c = new THREE.Color()
    c.setHSL(( 0.6 - ( x * 0.5 ) ), 1.0, 0.5)
    return c
  })
  const imgDir = opts.imgDir || '/globe/'

  // Declare "global" variables
  let camera, scene, renderer, w, h
  let mesh, point

  let distance = 100000
  let distanceTarget = opts.distanceTarget || 700
  const MAX_DISTANCE = opts.maxDistance || 1000
  const MIN_DISTANCE = opts.minDistance || 150
  const setDistanceTarget = opts.setDistanceTarget || (() => {})

  const curZoomSpeed = 0

  const MAX_ROTATION_VELOCITY = opts.maxRotation || 0.005
  const ROTATION_ACCELERATION = opts.rotationAcceleration || 0.0002
  let rotationVelocity = MAX_ROTATION_VELOCITY

  const rotation = { x: 0, y: 0 }
  let rotationRelease = { x: 0, y: 0 }

  let paused = false

  // Initialization function
  function init() {

    rotation.x = Math.PI

    let shader, uniforms, material

    w = container.offsetWidth || window.innerWidth
    h = container.offsetHeight || window.innerHeight

    camera = new THREE.PerspectiveCamera(30, w / h, 1, 10000)
    camera.position.z = distance
    camera.up.set(0, 1, 0)

    scene = new THREE.Scene()

    // Create / add the earth geometry
    let geometry = new THREE.SphereGeometry(EARTH_RADIUS, 20, 15)

    shader = Shaders['earth']
    uniforms = THREE.UniformsUtils.clone(shader.uniforms)

    uniforms['texture'].value = THREE.ImageUtils.loadTexture(imgDir + 'world.jpg')

    material = new THREE.ShaderMaterial({
      uniforms: uniforms,
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader
    })

    mesh = new THREE.Mesh(geometry, material)
    mesh.rotation.y = Math.PI
    scene.add(mesh)

    // Add the atmosphere
    shader = Shaders['atmosphere']
    uniforms = THREE.UniformsUtils.clone(shader.uniforms)

    material = new THREE.ShaderMaterial({
      uniforms: uniforms,
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true
    })

    mesh = new THREE.Mesh(geometry, material)
    mesh.scale.set( 1.1, 1.1, 1.1 )
    scene.add(mesh)

    // Add the point cloud
    geometry = new THREE.CubeGeometry(0.75, 0.75, 1)
    geometry.applyMatrix(new THREE.Matrix4().makeTranslation(0, 0, -0.5))

    point = new THREE.Mesh(geometry)

    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
    })
    renderer.setClearColor( 0xffffff, 0 )
    renderer.setSize(w, h)

    renderer.domElement.style.position = 'absolute'

    container.appendChild(renderer.domElement)

    window.addEventListener('resize', onWindowResize, false)
  }

  function addData(data, opts) {
    let lat, lng, size, color, i, step, colorFnWrapper

    step = 3
    colorFnWrapper = (data, i) => colorFn(data[i + 2])

    if (this._baseGeometry === undefined) {
      this._baseGeometry = new THREE.Geometry()
      for (i = 0; i < data.length; i += step) {
        lat = data[i]
        lng = data[i + 1]
        color = colorFnWrapper(data, i)
        size = 0
        addPoint(lat, lng, size, color, this._baseGeometry)
      }
    }
    if (this._morphTargetId === undefined) {
      this._morphTargetId = 0
    } else {
      this._morphTargetId += 1
    }
    opts.name = opts.name || 'morphTarget' + this._morphTargetId

    const subgeo = new THREE.Geometry()
    for (i = 0; i < data.length; i += step) {
      lat = data[i]
      lng = data[i + 1]
      color = colorFnWrapper(data, i)
      size = data[i + 2]
      size = size * EARTH_RADIUS
      addPoint(lat, lng, size, color, subgeo)
    }
    if (opts.animated) {
      this._baseGeometry.morphTargets.push({
        name: opts.name,
        vertices: subgeo.vertices
      })
    } else {
      this._baseGeometry = subgeo
    }
  }

  function createPoints() {
    if (this._baseGeometry !== undefined) {
      if (this._baseGeometry.morphTargets.length < 8) {
        var padding = 8 - this._baseGeometry.morphTargets.length
        for (var i = 0; i <= padding; i++) {
          this._baseGeometry.morphTargets.push({
            name: 'morphPadding' + i,
            vertices: this._baseGeometry.vertices
          })
        }
      }
      this.points = new THREE.Mesh(this._baseGeometry, new THREE.MeshBasicMaterial({
        color: 0xffffff,
        vertexColors: THREE.FaceColors,
        morphTargets: true
      }))
    }
    scene.add(this.points)
  }

  function addPoint(lat, lng, size, color, subgeo) {
    var phi = (90 - lat) * Math.PI / 180
    var theta = (180 - lng) * Math.PI / 180

    point.position.x = EARTH_RADIUS * Math.sin(phi) * Math.cos(theta)
    point.position.y = EARTH_RADIUS * Math.cos(phi)
    point.position.z = EARTH_RADIUS * Math.sin(phi) * Math.sin(theta)

    point.lookAt(mesh.position)

    point.scale.z = Math.max( size, 0.1 ) // avoid non-invertible matrix
    point.updateMatrix()

    for (var i = 0; i < point.geometry.faces.length; i++) {
      point.geometry.faces[i].color = color
    }

    THREE.GeometryUtils.merge(subgeo, point)
  }

  function onWindowResize() {
    camera.aspect = container.offsetWidth / container.offsetHeight
    camera.updateProjectionMatrix()
    renderer.setSize( container.offsetWidth, container.offsetHeight )
  }

  function zoom(delta) {
    const result = distanceTarget -= delta
    if (result > MAX_DISTANCE) {
      distanceTarget = MAX_DISTANCE
    } else if (distanceTarget < MIN_DISTANCE) {
      distanceTarget = MIN_DISTANCE
    } else {
      distanceTarget = result
    }

    setDistanceTarget(distanceTarget)
  }

  function touch(isTouched) {
    paused = isTouched
  }

  function pan(dx, dy) {
    rotation.y += dy * 2
    rotation.x -= dx * 2
  }

  function panRelease(velocityX, velocityY) {
    rotationRelease.x += velocityX * 0.05
    rotationRelease.y += velocityY * 0.05
  }

  function animate() {
    requestAnimationFrame(animate)
    render()
  }

  function render() {
    zoom(curZoomSpeed)

    const dRotation = paused ? -1 * ROTATION_ACCELERATION : ROTATION_ACCELERATION

    if (rotationVelocity > 0 && dRotation < 0) {
      rotationVelocity += dRotation
    }
    if (rotationVelocity < MAX_ROTATION_VELOCITY && dRotation > 0) {
      rotationVelocity += dRotation
    }

    rotation.x -= (rotationVelocity + rotationRelease.x)
    rotation.y += rotationRelease.y

    distance += (distanceTarget - distance) * 0.3

    rotationRelease.x *= 0.95
    rotationRelease.y *= 0.95

    camera.position.x = distance * Math.sin(rotation.x) * Math.cos(rotation.y)
    camera.position.y = distance * Math.sin(rotation.y)
    camera.position.z = distance * Math.cos(rotation.x) * Math.cos(rotation.y)

    const yRotations = Math.floor(rotation.y / (Math.PI / 2))
    if (yRotations % 4 === 1 || yRotations % 4 === 2) {
      camera.up.set(0, -1, 0)
    } else if (yRotations % 4 === 3 || yRotations % 4 === 0) {
      camera.up.set(0, 1, 0)
    }

    camera.lookAt(mesh.position)

    renderer.render(scene, camera)
  }

  init()
  this.animate = animate

  this.addData = addData
  this.createPoints = createPoints
  this.renderer = renderer
  this.scene = scene
  this.zoom = zoom
  this.pan = pan
  this.panRelease = panRelease
  this.touch = touch

  return this
}

export default DAT
