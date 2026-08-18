import { Data, Fake } from '@tomationjs/dsl'

const user = Data({
  name: Fake.fullName(),
  email: Fake.email(),
  phone: Fake.phone({ country: 'US' }),
  dob: Fake.dateOfBirth({ minAge: 18, maxAge: 65, format: 'MM/DD/YYYY' }),
  role: Fake.oneOf(['Admin', 'Editor', 'Viewer']),
  address: Fake.address(),
})

export default user
