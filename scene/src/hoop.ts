import * as ui from '@dcl/ui-scene-utils'
import * as utils from '@dcl/ecs-scene-utils'

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
        new utils.TriggerBoxShape(new Vector3(1, 0.5, 1), new Vector3(0, 0, 0)),
        {
          onTriggerEnter: () => {
            this.socket.send(
              JSON.stringify({
                type: dataType.SCORE,
                data: {
                  //   threePoints: threePointShot,
                  // score:
                }
              })
            )

            if (threePointShot) {
              ui.displayAnnouncement('3 Point shot!')
            } else {
              ui.displayAnnouncement('2 Point shot!')
            }
          },
          layer: 1,
          triggeredByLayer: 2
        }
      )
    )
  }
}
