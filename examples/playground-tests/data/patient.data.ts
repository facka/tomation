import { Data, Fake } from '@tomationjs/dsl'

const patient = Data({
  name: Fake.fullName(),
  dob: Fake.dateOfBirth({ minAge: 18, maxAge: 65, format: 'MM/DD/YYYY' }),
  phone: Fake.phone({ country: 'US' }),
  email: Fake.email(),
  address: Fake.address(),
  gender: Fake.oneOf(['Male', 'Female', 'Non-binary']),
  city: 'Springfield',
})

export default patient
