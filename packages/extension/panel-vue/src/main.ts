import './styles/global.css';
import './icons';
import { createApp } from 'vue';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import App from './App.vue';

const app = createApp(App);
app.component('font-awesome-icon', FontAwesomeIcon);
app.mount('#app');
