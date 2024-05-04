// actions.js

export const createActionDefinitions = (self) => {
    return {


        // set workspace status 
        workspace_status: {
            name: 'Set workspace status',
            options: [
                {
                    type: 'dropdown',
                    label: 'Workspace',
                    id: 'workspaceId',
                    default: '',
                    choices: self.cuego.getWorkspaceOptionSet(),
                },
                {
                    type: 'dropdown',
                    label: 'Status',
                    id: 'status',
                    default: '',
                    choices: self.cuego.getWorkspaceStatusOptionSet(),
                },
            ],
            callback: async (action, context) => {
                // log workspaces
                console.log('debug', `workspace status trigger:', ${action.options.workspaceId}, ${action.options.status}`)

                // set workspace status
                self.ws.send(self.cuego.sendMethod('workspaces.changeStatus', [action.options.status, action.options.workspaceId]), (err) => {
                    if (err) {
                        console.log('error', `Error sending workspace status command: ${err}`)
                    }
                })
            },
        },










        // set workspace status 
        cue_trigger_next: {
            name: 'Trigger Next Cue',
            options: [
                {
                    type: 'dropdown',
                    label: 'Workspace',
                    id: 'workspaceId',
                    default: '',
                    choices: self.cuego.getWorkspaceOptionSet(),
                },
            ],
            callback: async (action, context) => {
                // log workspaces
                console.log('debug', `workspace status trigger:', ${action.options.workspaceId}, ${action.options.status}`)

                // set workspace status
                self.ws.send(self.cuego.sendMethod('workspaces.trigger.next', [action.options.workspaceId]), (err) => {
                    if (err) {
                        console.log('error', `Error sending workspace status command: ${err}`)
                    }
                })
            },
        },

    };
};
