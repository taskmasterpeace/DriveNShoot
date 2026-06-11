class_name Const extends Node

const LANGUAGES: Array = [
	"en",
	"it"
]

const SAVE_FILE_BASE_PATH := "user://save"

const PATH = {
	FURY = "Entities/Fury"
}

const MENU = {
	TITLE_SCREEN = "res://scenes/menus/start_screen.gd"
}

const TRANSITION = {
	FADE_TO_BLACK = "fade_to_black",
	FADE_FROM_BLACK = "fade_from_black",
	FADE_TO_WHITE = "fade_to_white",
	FADE_FROM_WHITE = "fade_from_white",
}

# Town mission board: default bounty contract handed out by the contract-giver NPC.
const CONTRACT_KILLS := 3
const CONTRACT_REWARD := 60

const GROUP = {
	PLAYER = "player",
	ENEMY = "enemy",
	SAVE = "save",
	FLASH = "flash",
	LEVEL = "level",
	DESTINATION = "destination",
}
