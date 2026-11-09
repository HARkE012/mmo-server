import { Server, Room } from "colyseus";
import { Schema, MapSchema, defineTypes } from "@colyseus/schema";
import bcrypt from 'bcryptjs';
import db from './database.js';

class Player extends Schema {
  constructor() {
    super();
    this.x = 100;
    this.y = 100;
    this.name = "";
    this.race = "goblin";
    this.flipX = false;
    this.hp = 100;
    this.maxHp = 100;
    this.isBlocking = false;
    this.isDead = false;
  }
}
defineTypes(Player, {
  x: "number",
  y: "number",
  name: "string",
  race: "string",
  flipX: "boolean",
  hp: "number",
  maxHp: "number",
  isBlocking: "boolean",
  isDead: "boolean",
});

class State extends Schema {
  constructor() {
    super();
    this.players = new MapSchema();
  }
}
defineTypes(State, {
  players: { map: Player },
});

class GameRoom extends Room {
  onCreate() {
    this.setState(new State());
    this.maxClients = 20;

    this.onMessage("move", (client, data) => {
      const player = this.state.players.get(client.sessionId);
      if (player && !player.isDead) {
        player.x = data.x;
        player.y = data.y;
        player.flipX = data.flipX;
      }
    });

    this.onMessage("block", (client, isBlocking) => {
      const player = this.state.players.get(client.sessionId);
      if (player && !player.isDead) {
        player.isBlocking = isBlocking;
      }
    });

    this.onMessage("attack", (client) => {
      const attacker = this.state.players.get(client.sessionId);
      // Нельзя атаковать, если мертв или в блоке
      if (!attacker || attacker.isDead || attacker.isBlocking) return;

      const direction = attacker.flipX ? -1 : 1;
      const attackRange = 120;
      const attackWidth = 80;

      this.state.players.forEach((target, sessionId) => {
        if (sessionId === client.sessionId || target.isDead) return;

        const dx = target.x - attacker.x;
        const dy = target.y - attacker.y;

        const isInFront = (direction === 1 && dx > 0) || (direction === -1 && dx < 0);
        const inRangeX = Math.abs(dx) <= attackRange;
        const inRangeY = Math.abs(dy) <= attackWidth;

        if (isInFront && inRangeX && inRangeY) {
          let damage = 20;
          const targetDirection = target.flipX ? -1 : 1;
          const facingAttacker = (targetDirection === 1 && dx < 0) || (targetDirection === -1 && dx > 0);
          
          if (target.isBlocking && facingAttacker) {
            damage = damage / 2; // Блок снижает урон вдвое
          }

          target.hp -= damage;
          
          if (target.hp <= 0) {
            target.hp = 0;
            target.isDead = true;
            // Респавн
            setTimeout(() => {
              // Сначала восстанавливаем HP и позицию, потом снимаем флаг смерти!
              target.hp = target.maxHp;
              target.x = 1000;
              target.y = 1000;
              target.isDead = false;
            }, 3000);
          }
        }
      });

      // Рассылаем событие атаки (чтобы все видели клин)
      this.broadcast("player_attack", { sessionId: client.sessionId, direction });
    });

    this.onMessage("chat", (client, text) => {
      const player = this.state.players.get(client.sessionId);
      const name = player ? player.name : "???";
      this.broadcast("chat", { name, text });
    });
  }

  onJoin(client, options) {
    const { username, password, race } = options;
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    if (user) {
      const isValid = bcrypt.compareSync(password, user.password);
      if (!isValid) throw new Error("Неверный пароль!");
      console.log(`Игрок ${username} вошёл. Раса: ${user.race}`);
      
      const player = new Player();
      player.name = username;
      player.race = user.race;
      this.state.players.set(client.sessionId, player);
    } else {
      const hash = bcrypt.hashSync(password, 10);
      db.prepare('INSERT INTO users (username, password, race) VALUES (?, ?, ?)')
        .run(username, hash, race || 'goblin');
      
      console.log(`Зарегистрирован новый игрок: ${username}, раса: ${race}`);
      
      const player = new Player();
      player.name = username;
      player.race = race || 'goblin';
      this.state.players.set(client.sessionId, player);
    }
  }

  onLeave(client) {
    console.log("Игрок вышел:", client.sessionId);
    this.state.players.delete(client.sessionId);
  }
}

const gameServer = new Server();
gameServer.define("game", GameRoom);
const port = process.env.PORT || 2567;
gameServer.listen(port);
console.log("Сервер запущен на ws://localhost:2567");