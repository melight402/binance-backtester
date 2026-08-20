import './index.css';
import './assets/global.css';
import { render } from 'solid-js/web';
import { App } from './App.jsx';

// Импортируем глобальные стили (сюда можно перенести стили из обоих проектов)
import './assets/global.css'; 

const root = document.getElementById('root');

if (!root) {
  throw new Error('Корневой элемент #root не найден в index.html. Проверьте разметку.');
}

// Запускаем приложение
render(() => <App />, root);