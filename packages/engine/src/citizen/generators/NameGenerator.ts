import { SeededRandom } from '../../utils/SeededRandom';
import { CitizenGender } from '@genesis/shared';

export class NameGenerator {
  private static readonly MALE_FIRST_NAMES = [
    'James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph', 'Thomas', 'Charles',
    'Christopher', 'Daniel', 'Matthew', 'Anthony', 'Mark', 'Donald', 'Steven', 'Paul', 'Andrew', 'Joshua'
  ];

  private static readonly FEMALE_FIRST_NAMES = [
    'Mary', 'Patricia', 'Linda', 'Barbara', 'Elizabeth', 'Jennifer', 'Maria', 'Susan', 'Margaret', 'Dorothy',
    'Lisa', 'Nancy', 'Karen', 'Betty', 'Helen', 'Sandra', 'Donna', 'Carol', 'Ruth', 'Sharon'
  ];

  private static readonly LAST_NAMES = [
    'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
    'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin'
  ];

  public static generateName(seed: number, gender: CitizenGender): string {
    const random = new SeededRandom(seed);
    
    let firstNameList = this.MALE_FIRST_NAMES;
    if (gender === CitizenGender.FEMALE) {
      firstNameList = this.FEMALE_FIRST_NAMES;
    } else if (gender === CitizenGender.OTHER) {
      // For OTHER, randomly pick from either list based on the seed
      firstNameList = random.next() > 0.5 ? this.MALE_FIRST_NAMES : this.FEMALE_FIRST_NAMES;
    }

    const firstName = firstNameList[random.nextInt(0, firstNameList.length - 1)];
    const lastName = this.LAST_NAMES[random.nextInt(0, this.LAST_NAMES.length - 1)];

    return `${firstName} ${lastName}`;
  }
}
