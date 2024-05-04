import { InstanceStatus } from '@companion-module/base'


export class CueGO {
    constructor() {
        this.id = '';
        this.workspaces = new Map();
        this.presenters = [];
        this.subscriptions = new Map();
        this.methodId = 0;
    }
    
    // method function
    sendMethod(method, params) {

        this.methodId++;

        return JSON.stringify({
            "msg": "method",
            "method": method,
            "params": params,
            "id": this.methodId.toString()
        })
    }

    // subscribe function
    subscribeTo(name, params = []) {

        let newSubId = Math.random().toString(36).slice(2)

        // add to subscriptions
        this.addSubscription({
            id: newSubId,
            name: name,
            params: params
        });

        return {
            "msg": "sub",
            "id": newSubId,
            "name": name,
            "params":  params
        }
    }

    //add subscription
    addSubscription(subscription) {
        this.subscriptions.set(subscription.id, subscription);
    }

    // update subscription
    updateSubscription(subscriptionId, data) {

        let sub = this.subscriptions.get(subscriptionId);

        if (sub) {
            let updatedSub = {...sub, ...data};
            this.subscriptions.set(subscriptionId, updatedSub);
        }

    }

    // return true if 'api.user.workspaces' is subscribed
    isInitSubscriptionsComplete() {

        let workspacesSubInitiated = false;
        let presentersSubInitiated = true;
        let templatesSubInitiated = true;

        this.subscriptions.forEach((sub) => {
            if (sub.name === 'ws.user.workspaces' && sub.ready === true) {
                workspacesSubInitiated = true;
            }
        })

        if (workspacesSubInitiated && presentersSubInitiated && templatesSubInitiated) {   
            return true;
        }

        return false;
    }

    // add workspace   
    addWorkspace(workspace) {
        this.workspaces.set(workspace.id, workspace);
    }

    // remove workspace
    removeWorkspace(workspace) {
        this.workspaces.delete(workspace.id);
    }
    
    // update workspace data
    updateWorkspace(workspaceId, data) {
        let workspace = this.workspaces.get(workspaceId);

        if (workspace) {
            let updatedWorkspace = {...workspace, ...data};
            this.workspaces.set(workspaceId, updatedWorkspace);
        }
    }

    // get workspace
    getWorkspaceById(workspaceId) {
        return this.workspaces.get(workspaceId);
    }

    // get workspaces
    listWorkspaces() {
        return this.workspaces;
    }

    // format workspace for options
    getWorkspaceOptionSet() {
        
        let defaultOption = {
            id: '',
            label: 'Select a workspace'
        }

        let options = []

        this.workspaces.forEach((w) => {
            options.push({
                id: w.id,
                label: w.name
            })
        })


        let optionSet = [defaultOption, ...options]

        return optionSet
    }

    // return pong
    pong() {
        return {
            "msg": "pong"
        }
    }

    // connect to websocket
    connect() {
        
        return { 
            "msg": "connect",
            "version": "1",
            "support": [ "1", "pre2", "pre1" ]
        }
    }

    // workspace status
    getWorkspaceStatusOptionSet() {
        return [
            {
                id: 'clear',
                label: 'Clear'
            },
            {
                id: 'connecting',
                label: 'Connecting'
            },
            {
                id: 'live',
                label: 'Live'
            }
        ]
    }

}
