import { InstanceBase, runEntrypoint, InstanceStatus } from '@companion-module/base'
import WebSocket from 'ws'
import objectPath from 'object-path'
import { upgradeScripts } from './upgrade.js'
import { CueGO } from './src/cuego.js'
import { combineRgb } from '@companion-module/base'
import { createActionDefinitions } from './src/actions.js'

class WebsocketInstance extends InstanceBase {
	isInitialized = false

	subscriptions = new Map()
	wsRegex = '^wss?:\\/\\/([\\da-z\\.-]+)(:\\d{1,5})?(?:\\/(.*))?$'
	apiKeyRegex = '^[a-zA-Z0-9]{1,32}$'

	async init(config) {
		this.config = config
		this.cuego = new CueGO()

		this.initWebSocket()
		this.isInitialized = true
		this.isCueGOInitialized = false

		this.test = false;

	}

	updateCompanionBits() {
		// this.updateVariables()
		this.initActions()
		this.initFeedbacks()
		this.subscribeFeedbacks()
		this.checkFeedbacks()
	}

	async destroy() {
		this.isInitialized = false
		this.methodId = 0

		if (this.reconnect_timer) {
			clearTimeout(this.reconnect_timer)
			this.reconnect_timer = null
		}
		if (this.ws) {
			this.ws.close(1000)
			delete this.ws
		}
	}

	async configUpdated(config) {
		this.config = config
		this.initWebSocket()
	}

	updateVariables(callerId = null) {
		let variables = new Set()
		let defaultValues = {}
		this.subscriptions.forEach((subscription, subscriptionId) => {
			if (!subscription.variableName.match(/^[-a-zA-Z0-9_]+$/)) {
				return
			}
			variables.add(subscription.variableName)
			if (callerId === null || callerId === subscriptionId) {
				defaultValues[subscription.variableName] = ''
			}
		})
		let variableDefinitions = []
		variables.forEach((variable) => {
			variableDefinitions.push({
				name: variable,
				variableId: variable,
			})
		})
		this.setVariableDefinitions(variableDefinitions)
		if (this.config.reset_variables) {
			this.setVariableValues(defaultValues)
		}
	}

	maybeReconnect() {
		if (this.isInitialized && this.config.reconnect) {
			if (this.reconnect_timer) {
				clearTimeout(this.reconnect_timer)
			}
			this.reconnect_timer = setTimeout(() => {
				this.initWebSocket()
			}, 5000)
		}
	}

	initWebSocket() {
		if (this.reconnect_timer) {
			clearTimeout(this.reconnect_timer)
			this.reconnect_timer = null
		}

		const url = this.config.url
		if (!url || url.match(new RegExp(this.wsRegex)) === null) {
			this.updateStatus(InstanceStatus.BadConfig, `WS URL is not defined or invalid`)
			return
		}

		this.updateStatus(InstanceStatus.Connecting)

		if (this.ws) {
			this.ws.close(1000)
			delete this.ws
		}
		this.ws = new WebSocket(url)

		this.ws.on('open', () => {
			this.updateStatus(InstanceStatus.Ok)
			this.log('debug', `Connection opened`)

			this.connect()

			this.subscribeToWorkspaces()

			if (this.config.reset_variables) {
				// this.updateVariables()
			}
		})
		this.ws.on('close', (code) => {
			this.log('debug', `Connection closed with code ${code}`)
			this.updateStatus(InstanceStatus.Disconnected, `Connection closed with code ${code}`)
			this.maybeReconnect()
		})

		this.ws.on('message', this.messageReceivedFromWebSocket.bind(this))

		// return pong on ping
		this.ws.on('message', (msg) => {
			msg = JSON.parse(msg)

			if (msg.msg && msg.msg === 'ping') {
				this.log('debug', `Message sent: {"msg": "pong"}`)

				this.ws.send(JSON.stringify(this.cuego.pong()))
			}
		})

		this.ws.on('error', (data) => {
			this.log('error', `WebSocket error: ${data}`)
		})


	}


	connect() {
		this.ws.send(JSON.stringify(this.cuego.connect()), (err) => {
			if (err) {
				this.log('error', `Error sending connect command: ${err}`)
			}
		})
	}

	subscribeToWorkspaces() {
		this.ws.send(JSON.stringify(this.cuego.subscribeTo('ws.user.workspaces',[this.config.api_key])))
	}


	checkFeedbackSubscriptions() {
		
		// generate array of subscription ids
		let subscriptionIds = Array.from(this.subscriptions.keys())

		console.log(subscriptionIds);

		// run checkFeedbacks on all subscription ids
		this.checkFeedbacks(...subscriptionIds)

	}



	messageReceivedFromWebSocket(data) {
		if (this.config.debug_messages) {
			this.log('debug', `Message received: ${data}`)
		}

		let msgValue = null
		try {
			msgValue = JSON.parse(data)
		} catch (e) {
			msgValue = data
		}

		// no sub 
		if (msgValue.msg === 'nosub') {
			this.log('debug', `Subscription failed: ${msgValue.error.reason}`)

			if (msgValue.error.error === "403") {
				this.updateStatus(InstanceStatus.BadConfig, `API Key invalid`)
			}
		}


		// update collection
		if (msgValue.msg === 'added') {
			
			// process workspaces
			if (msgValue.collection === 'workspaces') {
				
				// add id to fields
				msgValue.fields.id = msgValue.id

				// add workspace
				this.cuego.addWorkspace(msgValue.fields)

				if (this.isCueGOInitialized) {
					this.updateCompanionBits()
				}
			}
		
		}

		// update collection
		if (msgValue.msg === 'changed') {
			
			// process workspaces
			if (msgValue.collection === 'workspaces') {
				
				// add id to fields
				msgValue.fields.id = msgValue.id

				// add workspace
				this.cuego.updateWorkspace(msgValue.id,msgValue.fields)

				if (this.isCueGOInitialized) {
					this.updateCompanionBits()
				}
			}
		
		}


		// update subscription on ready
		if (msgValue.msg === 'ready') {
			this.log('debug', `Subscription ready: ${msgValue.subs}`)

			// for each subs update subscription status
			msgValue.subs.forEach((sub) => {
				this.cuego.updateSubscription(
					sub,
					{
						ready: true
					}
				)
			})

			this.isCueGOInitialized = true
		}

		// check if 'api.user.workspaces' is subscribed
		if (msgValue.msg === 'ready') {
			if (this.cuego.isInitSubscriptionsComplete()) {
				this.log('debug', `Lets goooooooo!`)

				this.updateCompanionBits()
			}
		}

		// this.subscriptions.forEach((subscription) => {
		// 	if (subscription.variableName === '') {
		// 		return
		// 	}
		// 	if (subscription.subpath === '') {
		// 		this.setVariableValues({
		// 			[subscription.variableName]: typeof msgValue === 'object' ? JSON.stringify(msgValue) : msgValue,
		// 		})
		// 	} else if (typeof msgValue === 'object' && objectPath.has(msgValue, subscription.subpath)) {
		// 		let value = objectPath.get(msgValue, subscription.subpath)
		// 		this.setVariableValues({
		// 			[subscription.variableName]: typeof value === 'object' ? JSON.stringify(value) : value,
		// 		})
		// 	}
		// })
	}

	getConfigFields() {
		return [
			{
				type: 'static-text',
				id: 'info',
				width: 12,
				label: 'Information',
				value:
					"<strong>PLEASE READ THIS!</strong> Generic modules is only for use with custom applications. If you use this module to control a device or software on the market that more than you are using, <strong>PLEASE let us know</strong> about this software, so we can make a proper module for it. If we already support this and you use this to trigger a feature our module doesn't support, please let us know. We want companion to be as easy as possible to use for anyone.",
			},
			{
				type: 'textinput',
				id: 'url',
				label: 'Target URL',
				tooltip: 'The URL of the WebSocket server (ws[s]://domain[:port][/path])',
				width: 12,
				regex: '/' + this.wsRegex + '/',
			},
			{
				type: 'textinput',
				id: 'api_key',
				label: 'API Key',
				tooltip: 'Connects to the WebSocket server with the given API key',
				width: 12,
				regex: '/' + this.apiKeyRegex + '/',
			},
			{
				type: 'checkbox',
				id: 'reconnect',
				label: 'Reconnect',
				tooltip: 'Reconnect on WebSocket error (after 5 secs)',
				width: 6,
				default: true,
			},
			{
				type: 'checkbox',
				id: 'append_new_line',
				label: 'Append new line',
				tooltip: 'Append new line (\\r\\n) to cuego',
				width: 6,
				default: true,
			},
			{
				type: 'checkbox',
				id: 'debug_messages',
				label: 'Debug messages',
				tooltip: 'Log incomming and outcomming messages',
				width: 6,
			},
			{
				type: 'checkbox',
				id: 'reset_variables',
				label: 'Reset variables',
				tooltip: 'Reset variables on init and on connect',
				width: 6,
				default: true,
			},
		]
	}

	initFeedbacks() {
		this.setFeedbackDefinitions({
			workspace_status: {
				type: 'boolean',
				name: 'Workspace Status',
				description: 'Receive status changes for a specific workspace.',
				defaultStyle: {
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(220, 53, 69),
				},
				options: [
					{
						type: 'dropdown',
						label: 'Workspace',
						id: 'workspaceId',
						default: '',
						choices: this.cuego.getWorkspaceOptionSet(),
					},
					{
						type: 'dropdown',
						label: 'Status',
						id: 'status',
						default: 'live',
						choices: this.cuego.getWorkspaceStatusOptionSet(),
					},
				],
				callback: (feedback) => {

					// get workspace
					let workspace = this.cuego.getWorkspaceById(feedback.options.workspaceId)

					if (workspace) {
						// return true if status is the same
						return workspace.status === feedback.options.status
					}
					return false

				},
				subscribe: (feedback) => {

					this.subscriptions.set(feedback.id, feedback.options)
				},
				unsubscribe: (feedback) => {
					this.subscriptions.delete(feedback.id)
				},
			},
			workspace_timer: {
				type: 'boolean',
				name: 'Workspace Timer',
				description: 'Receive status changes for a specific workspace.',
				defaultStyle: {
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(220, 53, 69),
				},
				options: [
					{
						type: 'dropdown',
						label: 'Workspace',
						id: 'workspaceId',
						default: '',
						choices: this.cuego.getWorkspaceOptionSet(),
					}
				],
				callback: (feedback) => {

					// get workspace
					let workspace = this.cuego.getWorkspaceById(feedback.options.workspaceId)

					if (workspace) {
						// return true if status is the same
						return workspace.status === feedback.options.status
					}
					return false

				},
				subscribe: (feedback) => {

					this.subscriptions.set(feedback.id, feedback.options)
				},
				unsubscribe: (feedback) => {
					this.subscriptions.delete(feedback.id)
				},
			},
		})
	}

	initActions() {
		this.setActionDefinitions(createActionDefinitions(this))
	}
}

runEntrypoint(WebsocketInstance, upgradeScripts)
