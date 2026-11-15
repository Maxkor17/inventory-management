import { render } from 'preact';
import { Boot } from './features/boot/Boot';
import { installRouter } from './router/router';
import { installPrefsEffects } from './state/prefs';
import './styles/main.scss';

installPrefsEffects();
installRouter();
render(<Boot />, document.getElementById('app')!);
