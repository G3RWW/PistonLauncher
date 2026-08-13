import './styles.css';

// Side-effect modules: each wires up its own event listeners on import.
import './theme';
import './header';
import './panels';
import './scan';
import './backup';
import './quickLaunch';
import './overlayShortcut';
import './hotkeys';
import './runningStatus';
import './modalBehavior';

import { renderView } from './render';
import { reconcileOrphanedSessions } from './actions';

renderView();
reconcileOrphanedSessions();