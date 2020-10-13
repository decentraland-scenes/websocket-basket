import { getUserData } from '@decentraland/Identity'
import { getCurrentRealm } from '@decentraland/EnvironmentAPI'
import { ball } from './game'

// how often the lastKicker player sends updates to server, in seconds
const updateInterval = 5

const local: boolean = false

export let userData
export let alteredUserName

// types of data sent over websockets
export enum dataType {
  PING,
  PICK,
  THROW,
  SYNC,
  SCORE,
}

const server = local
  ? 'ws://localhost:8081/'
  : 'wss://64-225-45-232.nip.io/broadcast/'

export async function joinSocketsServer() {
  // keep players in different realms in separate rooms for the ws server
  log('about to get the user data')
  userData = await getUserData()
  alteredUserName = userData.displayName + Math.floor(Math.random() * 10000)

  let realm = await getCurrentRealm() // { displayName: 'pepito' } //

  log(`You are in the realm: `, realm.displayName)
  // connect to websockets server
  const socket = await new WebSocket(server + realm.displayName + '-basket')

  log('socket connection to: ', server + realm.displayName + '-basket')

  // for each ws message that arrives
  socket.onmessage = async function (event) {
    try {
      const msg = JSON.parse(event.data)
      log(msg)

      // ignore messages from the same player
      if (msg.data.user == alteredUserName) {
        log('ignoring own message')
        return
      }

      switch (msg.type) {
        case dataType.THROW:
          ball.otherThrow(
            msg.data.pos,
            msg.data.rot,
            msg.data.dir,
            msg.data.vel
          )
          break
        case dataType.PICK:
          ball.otherPickUp(msg.data.user, msg.data.pos, msg.data.streak)
          break
        case dataType.SYNC:
          ball.setPos(msg.data.pos, msg.data.rot, msg.data.holding)
          break
        case dataType.SCORE:
          //ball.setPos(msg.data.score, msg.data.threePoints)
          break
      }
    } catch (error) {
      log(error)
    }
  }

  socket.onerror = (res) => {
    log('wss ERR ', res)
  }

  socket.onclose = (res) => {
    log('DISCONNECTED FROM SERVER', socket.readyState)
  }

  engine.addSystem(new pingSystem(socket))

  engine.addSystem(new updateSystem(socket))

  return socket
}

class pingSystem implements ISystem {
  timer: number = 0
  socket: WebSocket
  update(dt: number): void {
    this.timer += dt
    if (this.timer >= 10) {
      this.timer = 0

      this.socket.send(
        JSON.stringify({
          type: dataType.PING,
          data: {},
        })
      )
    }
  }
  constructor(socket: WebSocket) {
    this.socket = socket
  }
}

class updateSystem implements ISystem {
  interval: number = updateInterval
  socket: WebSocket
  update(dt: number): void {
    // send updated to server at a regular interval
    if (ball.lastHolder) {
      this.interval -= dt
      if (this.interval < 0) {
        this.interval = updateInterval

        this.socket.send(
          JSON.stringify({
            type: dataType.SYNC,
            holding: ball.holding,
            pos: ball.getComponent(Transform).position,
            rot: ball.getComponent(Transform).rotation,
          })
        )
      }
    }
  }
  constructor(socket: WebSocket) {
    this.socket = socket
  }
}
