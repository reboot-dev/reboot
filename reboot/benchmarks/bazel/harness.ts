import { ExternalContext } from "@reboot-dev/reboot";
import { PromisePool } from "@supercharge/promise-pool";
import { performance } from "node:perf_hooks";
import parseIntoMilliseconds from "parse-duration";
import path from "path";

const argv = process.argv.slice(2);

if (argv.length !== 4) {
  console.error(`usage: <script> <duration> <partitions> <concurrency>`);
  process.exit(-1);
}

const SCRIPT = argv[0];

async function importBenchmark() {
  try {
    const module = await import(path.resolve(SCRIPT));

    if ("default" in module) {
      return module.default;
    } else {
      console.error(`Missing default export in ${SCRIPT}`);
    }
  } catch (error) {
    console.error("Error importing file:", error);
  }
  process.exit(-1);
}

const { op } = await importBenchmark();

const DURATION_MILLISECONDS = parseIntoMilliseconds(argv[1]);
const PARTITIONS = Number(argv[2]);
const CONCURRENCY = Number(argv[3]);

function statistics({ times, durationSeconds, tabular = false }) {
  if (times.length == 0) {
    return;
  }

  times.sort((a, b) => a - b);

  const percentile = (p) => {
    const index = Math.floor(p * times.length);
    return times[index];
  };

  if (tabular) {
    console.log(
      `Concurrency;50th percentile;99th percentile;99.9th percentile;op/s`
    );
    console.log(
      `${CONCURRENCY};${percentile(0.5).toFixed(3)};${percentile(0.99).toFixed(
        3
      )};${percentile(0.999).toFixed(3)};${Math.round(
        times.length / durationSeconds
      )}`
    );
  } else {
    console.log(`50th percentile: ${percentile(0.5).toFixed(3)}ms`);
    console.log(`99th percentile: ${percentile(0.99).toFixed(3)}ms`);
    console.log(`99.9th percentile: ${percentile(0.999).toFixed(3)}ms`);
    console.log(`op/s:`, Math.round(times.length / durationSeconds));
  }
}

async function benchmark({ op, url = "http://localhost:9991" }) {
  const generator = {
    async *[Symbol.asyncIterator]() {
      const begin = performance.now();
      let elapsed = () => {
        const milliseconds = performance.now() - begin;
        return milliseconds;
      };
      while (elapsed() < DURATION_MILLISECONDS) {
        yield true;
      }
    },
  };

  const context = new ExternalContext({ name: "benchmark", url });

  let intervalTimes = [];

  const benchmarkInterval = setInterval(() => {
    statistics({ times: intervalTimes, durationSeconds: 5.0 });
    intervalTimes = [];
  }, 5000);

  const times = [];

  console.log(
    `\n\nRunning benchmark for ${
      DURATION_MILLISECONDS / 1000
    } seconds with ${PARTITIONS} partitions and a concurrency of ${CONCURRENCY}\n\n`
  );

  await PromisePool.withConcurrency(CONCURRENCY)
    .for(generator)
    .useCorrespondingResults()
    .process(async (_, index, pool) => {
      try {
        const begin = performance.now();
        await op(context);
        const end = performance.now();
        const duration = end - begin;
        times.push(duration);
        intervalTimes.push(duration);
      } catch (e) {
        console.error(e);
        process.exit(-1);
      }
    });

  statistics({
    times,
    durationSeconds: DURATION_MILLISECONDS / 1000,
    tabular: true,
  });

  clearInterval(benchmarkInterval);
}

await benchmark({ op });
