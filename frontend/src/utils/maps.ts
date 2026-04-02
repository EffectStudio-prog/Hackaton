export const HOSPITAL_SEARCH_ZOOM = 12
export const GOOGLE_MAPS_EMBED_API_KEY = 'AIzaSyDsl23mh6ZJedlzX-Wl8udCq19JCb7qOg8'

export const buildNearbyHospitalsMapUrl = (latitude: number, longitude: number) =>
  `https://www.google.com/maps/embed/v1/search?key=${GOOGLE_MAPS_EMBED_API_KEY}&q=hospitals&center=${latitude},${longitude}&zoom=${HOSPITAL_SEARCH_ZOOM}`

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
