import { createRouter, createWebHistory } from 'vue-router'
import Home from '../App.vue'
import AuthCallback from '../pages/AuthCallback.vue'

const routes = [
  { path: '/', component: Home },
  { path: '/auth-callback', component: AuthCallback }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
