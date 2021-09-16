import * as ui from '@dcl/ui-scene-utils'
import * as utils from '@dcl/ecs-scene-utils'
/*
  IMPORTANT: The tsconfig.json has been configured to include "node_modules/cannon/build/cannon.js"
*/

import { Ball } from './ball'
import { addPhysicsConstraints } from './physicsConstraints'
import { FloatingTextUpdate } from './floatingText'
import { alteredUserName, dataType, joinSocketsServer } from './wsConnection'
import { meshIndices, meshVertices } from './physicsMesh'
import { Hoop } from './hoop'
import { Box } from 'cannon'

export let ball: Ball
const MAX_CATCH_DIST = 4

export let sceneStarted = false

let throwStrength = 0

export let threePointShot = false

// Create base scene
const baseScene: Entity = new Entity()
baseScene.addComponent(new GLTFShape('models/BasketScene.glb'))
baseScene.getComponent(GLTFShape).isPointerBlocker = true
baseScene.addComponent(
  new Transform({
    position: new Vector3(8, 0, 16),
    rotation: Quaternion.Euler(0, 90, 0),
  })
)
engine.addEntity(baseScene)

async function setUpScene() {
  let socket = await joinSocketsServer()

  // Setup our CANNON world
  const world = new CANNON.World()
  world.quatNormalizeSkip = 0
  world.quatNormalizeFast = false
  world.gravity.set(0, -9.82, 0) // m/s²

  //   addPhysicsConstraints(world, 2, 2, true)

  const groundMaterial = new CANNON.Material('groundMaterial')
  const groundContactMaterial = new CANNON.ContactMaterial(
    groundMaterial,
    groundMaterial,
    { friction: 0.1, restitution: 0.33 }
  )
  world.addContactMaterial(groundContactMaterial)

  let envShape = new CANNON.Trimesh(meshVertices, meshIndices)

  // Create a ground plane
  const planeShape = new CANNON.Plane()
  const groundBody = new CANNON.Body({
    mass: 0, // mass == 0 makes the body static
  })
  groundBody.addShape(planeShape)
  groundBody.material = groundMaterial
  groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2) // Reorient ground plane to be in the y-axis
  groundBody.position.y = 0.17 // Thickness of ground base model
  world.addBody(groundBody)

  const envBody = new CANNON.Body({
    mass: 0, // mass == 0 makes the body
    position: new CANNON.Vec3(8, 0, 16),
  })
  envBody.addShape(envShape)
  envBody.material = groundMaterial
  //envBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 0), -Math.PI / 2) // Reorient ground plane to be in the y-axis
  world.addBody(envBody)

  ball = new Ball(
    new Transform({
      position: new Vector3(8, 2, 8),
      scale: new Vector3(0.7, 0.7, 0.7),
    }),
    world,
    socket
  )

  const translocatorPhysicsContactMaterial = new CANNON.ContactMaterial(
    groundMaterial,
    ball.body.material,
    {
      friction: 0.1,
      restitution: 0.8,
    }
  )
  world.addContactMaterial(translocatorPhysicsContactMaterial)

  let hoop1 = new Hoop(
    new Transform({ position: new Vector3(8, 4.5, 7) }),
    socket
  )

  let hoop2 = new Hoop(
    new Transform({ position: new Vector3(8, 4.5, 32 - 7) }),
    socket
  )

  let strengthSys: strengthSetSystem
  // throw
  Input.instance.subscribe('BUTTON_DOWN', ActionButton.POINTER, false, (e) => {
    strenghtBar.bar.visible = true
    strenghtBar.background.visible = true
    strengthLabel.uiText.visible = true

    throwStrength = 1

    strengthSys = new strengthSetSystem()
    engine.addSystem(strengthSys)
  })

  Input.instance.subscribe('BUTTON_UP', ActionButton.POINTER, false, (e) => {
    engine.removeSystem(strengthSys)

    strenghtBar.bar.visible = true
    strenghtBar.background.visible = true
    strengthLabel.uiText.visible = true

    let shootDirection = Vector3.Forward().rotate(
      Camera.instance.rotation.clone()
    ) // Camera's forward vector

    log(
      'SHOOT DIRECTION: ',
      shootDirection,
      'Rot:',
      Camera.instance.rotation,
      'Euler: ',
      Camera.instance.rotation.eulerAngles
    )

    ball.playerThrow(shootDirection, throwStrength)

    checkShootdist()

    socket.send(
      JSON.stringify({
        type: dataType.THROW,
        data: {
          user: alteredUserName,
          pos: Camera.instance.position.clone(),
          rot: Camera.instance.rotation.clone(),
          dir: shootDirection,
          vel: throwStrength,
          timeStamp: Date.now(),
        },
      })
    )

    ball.addComponentOrReplace(
      new utils.Delay(1000, () => {
        strenghtBar.set(0)
        strenghtBar.bar.visible = false
        strenghtBar.background.visible = false
        strengthLabel.uiText.visible = false
      })
    )
  })

  // catch
  Input.instance.subscribe('BUTTON_DOWN', ActionButton.PRIMARY, false, (e) => {
    if (!ball.isFired || ball.holding || ball.otherHolding) {
      return
    }

    let dist = distance(
      ball.getComponent(Transform).position,
      Camera.instance.position.clone()
    )

    log(dist)

    if (dist < MAX_CATCH_DIST * MAX_CATCH_DIST * MAX_CATCH_DIST) {
      ball.playerPickUp(ball.getComponent(Transform).position.clone())
    }
  })

  // for debuggong
  Input.instance.subscribe(
    'BUTTON_DOWN',
    ActionButton.SECONDARY,
    false,
    (e) => {
      ball.playerPickUp(ball.getComponent(Transform).position.clone())
    }
  )

  return
}

function distance(pos1: Vector3, pos2: Vector3): number {
  const a = pos1.x - pos2.x
  const b = pos1.y - pos2.y
  const c = pos1.z - pos2.z
  return a * a + b * b + c * c
}

engine.addSystem(new FloatingTextUpdate())

let streakLabel = new ui.CornerLabel('Streak', -80, 30, Color4.Red())
export let streakCounter = new ui.UICounter(0, -10, 30, Color4.Red())
streakLabel.uiText.visible = false
streakCounter.uiText.visible = false

let strenghtBar = new ui.UIBar(
  0,
  -80,
  80,
  Color4.Red(),
  ui.BarStyles.ROUNDSILVER
)
let strengthLabel = new ui.CornerLabel('Strength', -80, 100, Color4.Red())
strenghtBar.bar.visible = false
strenghtBar.background.visible = false
strengthLabel.uiText.visible = false

let uiArea = new Entity()
uiArea.addComponent(
  new Transform({
    position: new Vector3(16, 0, 16),
  })
)
engine.addEntity(uiArea)

uiArea.addComponent(
  new utils.TriggerComponent(
    new utils.TriggerBoxShape(new Vector3(32, 32, 32), Vector3.Zero()),
    {
      onCameraEnter: () => {
        if (!sceneStarted) {
          setUpScene()
          sceneStarted = true
        }

        streakLabel.uiText.visible = true
        streakCounter.uiText.visible = true
      },
      onCameraExit: () => {
        streakLabel.uiText.visible = false
        streakCounter.uiText.visible = false
      },
    }
  )
)

class strengthSetSystem implements ISystem {
  update(dt: number): void {
    if (throwStrength < 100) {
      throwStrength += dt * 40
      strenghtBar.set(throwStrength / 100)

      log(throwStrength)
    } else {
      engine.removeSystem(this)
    }
  }
}

let distChecker = new Entity()
distChecker.addComponent(
  new Transform({
    position: new Vector3(8, 1, 7.2),
  })
)
engine.addEntity(distChecker)

let distChecker2 = new Entity()
distChecker2.addComponent(
  new Transform({
    position: new Vector3(8, 1, 32 - 7.2),
  })
)
engine.addEntity(distChecker2)

function checkShootdist() {
  let squaredDist = distance(
    Camera.instance.position,
    distChecker.getComponent(Transform).position
  )

  let squaredDist2 = distance(
    Camera.instance.position,
    distChecker2.getComponent(Transform).position
  )

  log('DIST: ', squaredDist)

  if (squaredDist < 27 || squaredDist2 < 27) {
    threePointShot = false
  } else {
    threePointShot = true
  }
}
