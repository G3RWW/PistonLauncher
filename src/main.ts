import './styles.css';

// Side-effect modules: each wires up its own event listeners on import.
import './theme';
import './panels';
import './scan';
import './backup';
import './quickLaunch';

import { renderView } from './render';

renderView();