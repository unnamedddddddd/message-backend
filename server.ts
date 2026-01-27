import { WebSocketServer } from 'ws';   
const wss = new WebSocketServer({ port: 3000 });

wss.on('connection', (ws) => {
  console.log('Новый user подключился');

  ws.send(JSON.stringify({
    type: 'system',
    message: "Добро пожаловать в чат",
    time: new Date().toLocaleTimeString()
  }))
  
  ws.on('message', (data: Buffer | JSON) => {
    const message = data.toString();
    console.log(`Получено ${message}`)

    wss.clients.forEach((client) => {
      if (client.readyState === 1 && client !== ws) {
        client.send(`${message}`)
      }
    })
  })

  ws.on('error', (error) => {
    console.error(`Error: ${error}`)
  }) 
})

wss.on('error', (error) => {
  console.error(`Error: ${error}`)
})