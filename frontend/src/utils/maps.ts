export const HOSPITAL_SEARCH_ZOOM = 12

export const buildNearbyHospitalsMapUrl = (latitude: number, longitude: number) =>
  `https://www.google.com/maps?q=hospitals&ll=${latitude},${longitude}&z=${HOSPITAL_SEARCH_ZOOM}&output=embed`

export const requestCurrentPosition = () =>
  new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('geolocation_not_supported'))
      return
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000,
    })
  })
