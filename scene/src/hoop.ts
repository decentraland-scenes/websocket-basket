import * as ui from '../node_modules/@dcl/ui-utils/index'
import utils from '../node_modules/decentraland-ecs-utils/index'
import { TriggerBoxShape } from '../node_modules/decentraland-ecs-utils/triggers/triggerSystem'
import { threePointShot } from './game'
import { dataType } from './wsConnection'

export class Hoop extends Entity {
  socket: WebSocket
  constructor(transform: Transform, socket: WebSocket) {
    super()
    engine.addEntity(this)
    this.socket = socket

    this.addComponent(transform)

    this.addComponent(
      new utils.TriggerComponent(
        new TriggerBoxShape(new Vector3(1, 0.5, 1), new Vector3(0, 0, 0)),
        2,
        1,
        () => {
          this.socket.send(
            JSON.stringify({
              type: dataType.SCORE,
              data: {
                //   threePoints: threePointShot,
                // score:
              },
            })
          )

          if (threePointShot) {
            ui.displayAnnouncement('3 Point shot!')
          } else {
            ui.displayAnnouncement('2 Point shot!')
          }
        },
        null,
        null,
        null
        //true
      )
    )
  }
}
