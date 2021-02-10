import { Sound } from './sounds'
import * as ui from '@dcl/ui-scene-utils'
import { createFloatingText } from './floatingText'
import { alteredUserName, dataType } from './wsConnection'
import { streakCounter } from './game'
import * as utils from '@dcl/ecs-scene-utils'

const X_OFFSET = 0
const Y_OFFSET = -0.5
const Z_OFFSET = 1.5

const FIXED_TIME_STEPS = 1.0 / 60.0 // seconds
const MAX_TIME_STEPS = 3
//const RECALL_SPEED = 10
const SHOOT_VELOCITY = 45

const shootSound = new Sound(new AudioClip('sounds/shoot.mp3'))
const recallSound = new Sound(new AudioClip('sounds/recall.mp3'))

const idleBall = new GLTFShape('models/idle.glb')
const confusedBall = new GLTFShape('models/confused.glb')
const happyBall = new GLTFShape('models/happy.glb')
const madBall = new GLTFShape('models/mad.glb')

const dummyEnt = new Entity()
dummyEnt.addComponent(new Transform({ position: new Vector3(4, -4, 4) }))
engine.addEntity(dummyEnt)
dummyEnt.addComponentOrReplace(confusedBall)

const dummyEnt2 = new Entity()
dummyEnt2.addComponent(new Transform({ position: new Vector3(4, -4, 4) }))
engine.addEntity(dummyEnt2)
dummyEnt2.addComponentOrReplace(happyBall)

const dummyEnt3 = new Entity()
dummyEnt3.addComponent(new Transform({ position: new Vector3(4, -4, 4) }))
engine.addEntity(dummyEnt3)
dummyEnt3.addComponentOrReplace(madBall)

export enum BallState {
  Idle,
  Confused,
  Happy,
  Mad,
}

export class Ball extends Entity {
  isFired: boolean = false
  //   blueGlow = new Entity()
  //   orangeGlow = new Entity()
  body: CANNON.Body
  holding: boolean = false
  otherHolding: boolean = false
  lastHolder: boolean = false
  world: CANNON.World
  socket: WebSocket
  constructor(transform: Transform, world: CANNON.World, socket: WebSocket) {
    super()
    engine.addEntity(this)
    this.addComponent(idleBall)
    this.addComponent(transform)

    this.world = world
    this.socket = socket

    this.addComponent(
      new OnPointerDown(
        () => {
          if (this.holding || this.otherHolding) return

          this.playerPickUp(this.getComponent(Transform).position.clone())
        },
        { hoverText: 'Pick up', distance: 6, button: ActionButton.PRIMARY }
      )
    )

    this.body = new CANNON.Body({
      mass: 3, // kg
      position: new CANNON.Vec3(
        transform.position.x,
        transform.position.y,
        transform.position.z
      ), // m
      shape: new CANNON.Sphere(0.25), // m (Create sphere shaped body with a radius of 0.2)
    })

    const translocatorPhysicsMaterial: CANNON.Material = new CANNON.Material(
      'translocatorMaterial'
    )

    this.body.material = translocatorPhysicsMaterial // Add bouncy material to translocator body
    this.body.linearDamping = 0.4 // Round bodies will keep translating even with friction so you need linearDamping
    this.body.angularDamping = 0.4 // Round bodies will keep rotating even with friction so you need angularDamping
    world.addBody(this.body) // Add body to the world

    this.body.addEventListener('collide', (e) => {
      log('Collided with body:', e.body)
      // sparks
      // randomly play voice
    })

    this.addComponent(
      new utils.TriggerComponent(
        new utils.TriggerSphereShape(0.25, new Vector3(0, 0, 0)),
        {
          onTriggerEnter: () => {
            ui.displayAnnouncement('SCORE!')
          },
          layer: 2,
          triggeredByLayer: 1,
        }
      )
    )
  }

  setPos(pos: Vector3, rot: Quaternion, holding?: boolean) {
    this.getComponent(Transform).position.copyFrom(pos)
    this.getComponent(Transform).rotation.copyFrom(rot)

    this.body.position = new CANNON.Vec3(pos.x, pos.y, pos.z)
    this.body.quaternion = new CANNON.Quaternion(rot.x, rot.y, rot.z, rot.w)

    this.lastHolder = false
    this.holding = false
    if (holding) {
      this.otherHolding = true
    } else {
      this.otherHolding = false
    }
  }

  playerPickUp(pos: Vector3) {
    this.holding = true
    this.lastHolder = true
    this.otherHolding = false
    this.isFired = false
    recallSound.getComponent(AudioSource).playOnce()

    this.switchState(BallState.Happy)

    this.body.velocity.setZero()
    this.body.angularVelocity.setZero()
    this.setParent(Attachable.FIRST_PERSON_CAMERA) //  FIRST_PERSON_CAMERA)
    this.getComponent(Transform).position.set(X_OFFSET, Y_OFFSET, Z_OFFSET)
    this.getComponent(Transform).rotation = Quaternion.Euler(0, 180, 0)
    this.body.position = new CANNON.Vec3(X_OFFSET, Y_OFFSET, Z_OFFSET)
    //this.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 0), 0)

    if (pos.y > 0.5) {
      ui.displayAnnouncement('Good catch!')
      streakCounter.increase()
    } else {
      streakCounter.set(0)
    }

    this.socket.send(
      JSON.stringify({
        type: dataType.PICK,
        data: {
          user: alteredUserName,
          pos: pos,
          streak: streakCounter.read(),
          timeStamp: Date.now(),
        },
      })
    )

    // if y > 0 -> Show UI "Caught!"

    // maybe if currently moving / longer distance, more score
  }
  otherPickUp(user: string, pos: Vector3, streak: number) {
    this.holding = false
    this.lastHolder = false
    this.otherHolding = true
    this.isFired = false

    this.body.velocity.setZero()
    this.body.angularVelocity.setZero()

    if (pos.y > 1.5) {
      createFloatingText('Wow!', pos, 0.5, 2, Color3.Red())
    } else if (pos.y > 0.5) {
      createFloatingText('Good Catch!', pos, 0.5, 2, Color3.Red())
    } else {
      createFloatingText('Picked frisbee up', pos, 0.5, 2)
    }
    streakCounter.set(streak)

    // if y > 0 -> Show in-world UI "Caught!"
  }
  playerThrow(shootDirection: Vector3, shootStrength: number) {
    if (this.isFired || !this.holding) return
    this.isFired = true
    engine.addSystem(new shootBallSystem(this))
    this.addComponentOrReplace(confusedBall)

    shootSound.getComponent(AudioSource).playOnce()
    this.holding = false

    this.switchState(BallState.Confused)

    //this.setGlow(true)
    this.setParent(null)

    this.body.position.set(
      Camera.instance.feetPosition.x + shootDirection.x,
      shootDirection.y + Camera.instance.position.y,
      Camera.instance.feetPosition.z + shootDirection.z
    )

    // Shoot
    this.body.applyImpulse(
      new CANNON.Vec3(
        shootDirection.x * shootStrength,
        shootDirection.y * shootStrength,
        shootDirection.z * shootStrength
      ),
      new CANNON.Vec3(
        this.body.position.x,
        this.body.position.y,
        this.body.position.z
      )
    )
  }
  otherThrow(
    pos: Vector3,
    rot: Quaternion,
    shootDirection: Vector3,
    shootStrength: number
  ) {
    this.holding = false
    this.lastHolder = false
    this.otherHolding = false
    this.isFired = true
    this.switchState(BallState.Confused)
    //shootSound.getComponent(AudioSource).playOnce()

    this.getComponent(GLTFShape).visible = true
    this.setParent(null)

    engine.addSystem(new shootBallSystem(this))

    this.getComponent(Transform).position.copyFrom(pos)
    this.getComponent(Transform).rotation.copyFrom(rot)

    this.body.position = new CANNON.Vec3(pos.x, pos.y, pos.z)
    this.body.quaternion = new CANNON.Quaternion(rot.x, rot.y, rot.z, rot.w)

    this.body.applyImpulse(
      new CANNON.Vec3(
        shootDirection.x * shootStrength,
        shootDirection.y * shootStrength,
        shootDirection.z * shootStrength
      ),
      new CANNON.Vec3(pos.x, pos.y, pos.z)
    )
  }
  switchState(state: BallState) {
    switch (state) {
      case BallState.Idle:
        this.addComponentOrReplace(idleBall)
        break
      case BallState.Confused:
        this.addComponentOrReplace(confusedBall)
        break
      case BallState.Happy:
        this.addComponentOrReplace(happyBall)
        break
      case BallState.Mad:
        this.addComponentOrReplace(madBall)
        break
    }
  }
}

class shootBallSystem implements ISystem {
  ball: Ball
  constructor(ball: Ball) {
    this.ball = ball
  }
  update(dt: number): void {
    if (this.ball.isFired) {
      this.ball.world.step(FIXED_TIME_STEPS, dt, MAX_TIME_STEPS)
      this.ball
        .getComponent(Transform)
        .position.copyFrom(this.ball.body.position)

      this.ball
        .getComponent(Transform)
        .rotation.copyFrom(this.ball.body.quaternion)
    } else {
      engine.removeSystem(this)
    }
  }
}
