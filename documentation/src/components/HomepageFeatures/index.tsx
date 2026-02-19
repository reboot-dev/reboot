import clsx from "clsx";
import React from "react";
import styles from "./styles.module.css";

type FeatureItem = {
  title: string;
  Svg: React.ComponentType<React.ComponentProps<"svg">>;
  description: JSX.Element;
};

const FeatureList: FeatureItem[] = [
  {
    title: "Simple",
    Svg: require("@site/static/img/simple.svg").default,
    description: (
      <>
        Reboot lays out a set of simple primitives that give developers the
        power to code distributed systems that scale.
      </>
    ),
  },
  {
    title: "Safe",
    Svg: require("@site/static/img/safe.svg").default,
    description: (
      <>
        Learn how Reboot's safety hierarchy gives you confidence your software
        is correct, no matter how large or complicated.
      </>
    ),
  },
  {
    title: "Ergonomic",
    Svg: require("@site/static/img/ergonomic.svg").default,
    description: (
      <>
        Adding state to your backend is simple. See how few lines of code it
        takes to migrate an existing gRPC service to Reboot.
      </>
    ),
  },
];

function Feature({ title, Svg, description }: FeatureItem) {
  return (
    <div className={clsx("col col--4")}>
      <div className="text--center">
        <Svg className={styles.featureSvg} role="img" />
      </div>
      <div className="text--center padding-horiz--md">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): JSX.Element {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
