import BaseModule from '../base'
import { cloneDeep, isEmpty } from 'lodash'
import { NETWORKS } from '@config'
import eventBus from '@/plugins/event-bus'
import NetworkModel from '@/models/network'
import Client from '@/services/client'
import Vue from 'vue'

export default new BaseModule(NetworkModel, {

  state: () => ({
    all: [],
    customNetworks: {}
  }),

  getters: {
    bySymbol: state => symbol => {
      return state.all.find(network => network.symbol === symbol)
    },
    byToken: state => token => {
      return state.all.find(network => network.token === token)
    },
    byName: state => name => {
      return state.all.find(network => network.name === name)
    },

    feeStatisticsByType: (_, __, ___, rootGetters) => type => {
      const network = rootGetters['session/network']

      if (!network) {
        throw new Error('[network/feeStatisticsByType] No active network.')
      }

      if (network.apiVersion === 1) {
        throw new Error('[network/feeStatisticsByType] Supported only by v2 networks.')
      }

      const { feeStatistics } = network
      const data = feeStatistics.find(transactionType => transactionType.type === type)
      return data ? data.fees : []
    },

    customNetworkById: state => id => {
      return state.customNetworks[id]
    },

    customNetworks: state => state.customNetworks
  },

  mutations: {
    SET_ALL (state, value) {
      state.all = value
    },
    ADD_CUSTOM_NETWORK (state, value) {
      Vue.set(state.customNetworks, value.id, value)
    },
    UPDATE_CUSTOM_NETWORK (state, value) {
      if (state.customNetworks[value.id]) {
        Vue.set(state.customNetworks, value.id, value)
      }
    },
    REMOVE_CUSTOM_NETWORK (state, value) {
      Vue.delete(state.customNetworks, value)
    }
  },

  actions: {
    load ({ commit, getters }) {
      const all = cloneDeep(getters['all'])
      if (!isEmpty(all)) {
        // TODO: remove in future major version
        // This is a "hack" to make sure all custom networks are in state.all
        let missingCustom = false
        for (const custom of Object.values(getters['customNetworks'])) {
          if (!all.find(network => network.name === custom.name)) {
            all.push(custom)
            missingCustom = true
          }
        }
        if (missingCustom) {
          commit('SET_ALL', all)
        }

        return
      }

      commit('SET_ALL', NETWORKS)
    },

    // Updates the feeStatistics for the available networks
    async fetchFees ({ commit, getters }) {
      let networks = getters['all']
      let updatedNetworks = cloneDeep(networks)
      if (networks) {
        let i
        for (i = 0; i < updatedNetworks.length; i++) {
          let network = updatedNetworks[i]
          try {
            let feeStats = await Client.fetchFeeStatistics(network.server, network.apiVersion)
            if (feeStats) {
              network.feeStatistics = feeStats
            }
          } catch (error) {
            //
          }
        }
      }
      commit('SET_ALL', updatedNetworks)
    },

    addCustomNetwork ({ dispatch, commit }, network) {
      commit('ADD_CUSTOM_NETWORK', network)
      dispatch('create', network)
    },

    async updateCustomNetwork ({ dispatch, commit, rootGetters }, network) {
      commit('UPDATE_CUSTOM_NETWORK', network)
      dispatch('update', network)

      // Trigger a profile change/reload if updating current network
      const currentNetwork = rootGetters['session/network']
      if (currentNetwork.id === network.id) {
        await dispatch('session/setProfileId', rootGetters['session/profileId'], { root: true })
        eventBus.emit('client:changed')
      }
    },

    removeCustomNetwork ({ dispatch, commit }, id) {
      commit('REMOVE_CUSTOM_NETWORK', id)
      dispatch('delete', { id })
    }
  }
})
