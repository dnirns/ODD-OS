import Terminal from "../components/Terminal";
import { createDisplayTestScreen } from "../os/terminal/displayTestScreen";
import styles from "./page.module.css";

const Home = () => (
  <main className={styles.screen} aria-label="ODD/OS">
    <Terminal screen={createDisplayTestScreen()} />
  </main>
);

export default Home;
