function photoCenter(photo) {
  return [photo.location.longitude, photo.location.latitude];
}

export function photoHeading(photo) {
  const orientation = Number(photo.orientation);
  return Number.isFinite(orientation) ? ((-orientation % 360) + 360) % 360 : 0;
}

export async function animateCamera(view, target, options = {}) {
  try {
    const animationOptions =
      options.duration == null
        ? {
            easing: "cubic-in-out",
            speedFactor: 0.85,
            maxDuration: 5000,
            ...options,
          }
        : options;
    await view.goTo(target, animationOptions);
    return true;
  } catch (error) {
    if (error?.name !== "AbortError") throw error;
    return false;
  }
}

export function createCameraController(view) {
  let overviewViewpoint = null;
  let focusViewpoint = null;
  let operationVersion = 0;
  let orbitFrame = 0;

  function stop() {
    operationVersion += 1;
    cancelAnimationFrame(orbitFrame);
    orbitFrame = 0;
  }

  async function goTo(target, options) {
    return animateCamera(view, target, options);
  }

  function setOverviewViewpoint(viewpoint = view.viewpoint) {
    overviewViewpoint = viewpoint?.clone?.() || viewpoint;
  }

  async function framePhoto(photo) {
    stop();
    return goTo(
      { center: photoCenter(photo) },
      { duration: 450, easing: "ease-in-out" },
    );
  }

  function approachPhoto(photo) {
    focusViewpoint ||= view.viewpoint.clone();
    return goTo(
      {
        center: photoCenter(photo),
        zoom: 16,
        heading: photoHeading(photo),
        tilt: 72,
      },
      {
        easing: "cubic-in-out",
        speedFactor: 0.55,
        maxDuration: 7000,
      },
    );
  }

  async function focusPhoto(photo) {
    stop();
    return approachPhoto(photo);
  }

  async function orbitPhoto(photo) {
    stop();
    const version = operationVersion;
    const focused = await approachPhoto(photo);
    if (!focused || version !== operationVersion) return false;

    const target = photo.location;
    const camera = view.camera;
    const latitudeRadians = (target.latitude * Math.PI) / 180;
    const metersPerDegreeLatitude = 111_320;
    const metersPerDegreeLongitude = Math.max(
      metersPerDegreeLatitude * Math.cos(latitudeRadians),
      1,
    );
    const latitudeDistance =
      (camera.position.latitude - target.latitude) * metersPerDegreeLatitude;
    const longitudeDistance =
      (camera.position.longitude - target.longitude) * metersPerDegreeLongitude;
    const radius = Math.max(
      Math.hypot(latitudeDistance, longitudeDistance),
      40,
    );
    let heading = camera.heading;
    let previousTime = performance.now();

    function orbit(time) {
      if (version !== operationVersion) {
        orbitFrame = 0;
        return;
      }

      heading = (heading + (time - previousTime) * 0.004) % 360;
      previousTime = time;
      const headingRadians = (heading * Math.PI) / 180;
      const nextCamera = view.camera.clone();
      nextCamera.position = {
        longitude:
          target.longitude -
          (Math.sin(headingRadians) * radius) / metersPerDegreeLongitude,
        latitude:
          target.latitude -
          (Math.cos(headingRadians) * radius) / metersPerDegreeLatitude,
        z: camera.position.z,
        spatialReference: camera.position.spatialReference,
      };
      nextCamera.heading = heading;
      nextCamera.tilt = 72;
      view.camera = nextCamera;
      orbitFrame = requestAnimationFrame(orbit);
    }

    orbitFrame = requestAnimationFrame(orbit);
    return true;
  }

  async function restoreFocusViewpoint() {
    stop();
    const viewpoint = focusViewpoint;
    focusViewpoint = null;
    if (!viewpoint) return false;
    return goTo(viewpoint, {
      duration: 900,
      easing: "ease-in-out",
    });
  }

  async function resetToOverview() {
    stop();
    focusViewpoint = null;
    if (!overviewViewpoint) return false;
    return goTo(overviewViewpoint, {
      duration: 1_100,
      easing: "ease-in-out",
    });
  }

  return {
    focusPhoto,
    framePhoto,
    orbitPhoto,
    restoreFocusViewpoint,
    resetToOverview,
    setOverviewViewpoint,
    endFrame() {
      view.animation?.stop();
    },
    stop,
  };
}
