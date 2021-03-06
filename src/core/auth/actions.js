import {
  SIGN_IN_SUCCESS,
  SIGN_IN_FAILURE,
  SIGN_OUT_SUCCESS,
} from './action-types'

import { userActions } from 'src/core/user'
import Firebase from 'firebase'

// Called when the page loads, manages the facebook oauth redirect / login flow
export function initAuth() {
  return (dispatch, getState) => {
    const { firebase } = getState()

    // Set up a firebase auth state listener to get the currently logged in user (this will succeed)
    // if the user is logged in and a session token exists, otherwise we'll have to look for the
    // result of the oauth redirect)
    const unsubscribe = firebase.auth().onAuthStateChanged(user => {
      unsubscribe()
      if (user) {
        // User signed in, dispatch a success action and fetch the user data
        dispatch({ type: SIGN_IN_SUCCESS, payload: user })
        return dispatch(userActions.getUserData(user.uid))
      } else {
        // Otherwise, get the result of the redirect
        firebase.auth().getRedirectResult().then(result => {
          dispatch(handleRedirectResult(result))
        })
      }
    })
  }
}

// General handler for firebase oauth redirect result
function handleRedirectResult(result) {
  return (dispatch) => {
    const authUser = result.user

    if (authUser) {
      return dispatch(handleSuccesfulRedirect(authUser))
    } else {
      return dispatch({ type: SIGN_IN_FAILURE })
    }
  }
}

// Success handler for firebase oauth redirect result
function handleSuccesfulRedirect(authUser) {
  return (dispatch) => {
    // Since we've succesfully fetched an authenticated user from the fireabase oauth redirect,
    // we'll need to first trigger the logic to load or create a user object in firebase (from the
    // facebook scope data we've fetched), then trigger our login success logic
    return dispatch(userActions.loadOrCreateUser(authUser))
      .then(() => {
        // Dispatch a sign in success action, then set local storage authenticating to false
        dispatch({ type: SIGN_IN_SUCCESS, payload: authUser })

        // Now that the user is logged in, get the user data and register the user listeners
        return dispatch(userActions.getUserData(authUser.uid))
      })
  }
}

// Manage the sign in with facebook flow (sign in button handler)
export function signInWithFacebook() {
  return (dispatch, getState) => {
    const { firebase } = getState()

    const provider = new Firebase.auth.FacebookAuthProvider()
    provider.addScope('email')

    // Set the local storage token, then trigger the redirect oauth flow
    firebase.auth().signInWithRedirect(provider)
  }
}

// Manage signing out of the application
export function signOut() {
  return (dispatch, getState) => {
    const { firebase } = getState()
    firebase.auth().signOut().then(() => {
      dispatch({ type: SIGN_OUT_SUCCESS })
    })
  }
}
