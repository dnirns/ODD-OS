import Computer from "../components/Computer";
import styles from "./page.module.css";

const Home = () => (
  <main className={styles.screen} aria-label="ODD/OS">
    <Computer />
  </main>
);

export default Home;
