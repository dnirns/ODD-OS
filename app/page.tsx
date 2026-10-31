import BootScreen from "../components/BootScreen";
import styles from "./page.module.css";

const Home = () => (
  <main className={styles.screen} aria-label="ODD/OS">
    <BootScreen />
  </main>
);

export default Home;
