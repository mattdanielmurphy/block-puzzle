import { Bot, BotWeights } from "./bot"

import { GameEngine } from "../engine/logic"

self.onmessage = (e) => {
	const { id, serializedEngine, weights } = e.data

	const engine = new GameEngine()
	engine.deserialize(serializedEngine)

	const bot = new Bot(engine, weights)
	const bestMove = bot.findBestMove()

	self.postMessage({ id, bestMove })
}
