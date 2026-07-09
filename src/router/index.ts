import { createRouter, createWebHistory } from 'vue-router'
import ContentView from '../views/ContentView.vue'

/**
 * Real, bookmarkable URLs per page. Every route renders the same (empty)
 * view — the board itself lives outside <router-view> and App.vue swaps
 * its content when the path changes. Unknown paths fall through to the
 * catchall and get the 404 content.
 */
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: ContentView },
    { path: '/projects', name: 'projects', component: ContentView },
    { path: '/projects/:slug', name: 'article', component: ContentView },
    { path: '/contact', name: 'contact', component: ContentView },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: ContentView },
  ],
})

export default router
