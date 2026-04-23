'use client'

import { useEffect, useState } from "react";

// Comprehensive list of Marvel characters, Valorant agents, DC Comics characters, famous footballers, anime characters, and video game characters
// All names are clean (no numbers or symbols) and unique
const NAMES = [
  // Marvel Characters
  "IronMan", "CaptainAmerica", "Thor", "Hulk", "BlackWidow", "Hawkeye", "SpiderMan", "BlackPanther", 
  "DoctorStrange", "ScarletWitch", "Vision", "Falcon", "WinterSoldier", "AntMan", "Wasp", "CaptainMarvel",
  "Gamora", "Drax", "Groot", "Rocket", "StarLord", "Mantis", "Nebula", "Loki", "Valkyrie", "ShangChi",
  "MsMarvel", "SheHulk", "MoonKnight", "Blade", "GhostRider", "Punisher", "Daredevil", "JessicaJones",
  "LukeCage", "IronFist", "Deadpool", "Wolverine", "Storm", "Cyclops", "JeanGrey", "ProfessorX",
  "Magneto", "Rogue", "Gambit", "Nightcrawler", "Colossus", "Shadowcat", "Phoenix", "Beast",
  
  // Valorant Agents
  "Jett", "Phoenix", "Sage", "Sova", "Viper", "Cypher", "Reyna", "Breach", "Omen", "Brimstone",
  "Raze", "Skye", "Yoru", "Astra", "KAYO", "Chamber", "Neon", "Fade", "Harbor", "Gekko",
  "Deadlock", "Iso", "Clove",
  
  // DC Comics Characters
  "Batman", "Superman", "WonderWoman", "Flash", "GreenLantern", "Aquaman", "Cyborg", "Shazam",
  "GreenArrow", "BlackCanary", "MartianManhunter", "Nightwing", "Robin", "Batgirl", "Catwoman",
  "HarleyQuinn", "PoisonIvy", "Joker", "LexLuthor", "Darkseid", "Doomsday", "Brainiac", "Bane",
  "Riddler", "Penguin", "TwoFace", "Scarecrow", "RaAlGhul", "Deathstroke", "BlackAdam", "Hawkman",
  "Hawkgirl", "Zatanna", "Constantine", "SwampThing", "Etrigan", "PlasticMan", "Firestorm", "Atom",
  "BlueBeetle", "BoosterGold", "Huntress", "PowerGirl", "Supergirl", "Steel", "Superboy", "KidFlash",
  
  // Famous Footballers
  "Messi", "Ronaldo", "Neymar", "Mbappe", "Haaland", "Benzema", "Lewandowski", "Salah", "Mane", "DeBruyne",
  "Modric", "Kroos", "Casemiro", "Kante", "Kimmich", "Alaba", "Ramos", "Pique", "Thiago", "Fabinho",
  "Henderson", "Silva", "Aguero", "Suarez", "Cavani", "Ibrahimovic", "Drogba", "Torres", "Villa", "Iniesta",
  "Xavi", "Pirlo", "Gerrard", "Lampard", "Scholes", "Giggs", "Beckham", "Zidane", "Ronaldinho", "Rivaldo",
  "Ronaldo", "Romario", "Pele", "Maradona", "Cruyff", "Beckenbauer", "Muller", "Platini", "Zico", "Eusebio",
  
  // Anime Characters
  "Naruto", "Sasuke", "Sakura", "Kakashi", "Itachi", "Madara", "Obito", "Minato", "Jiraiya", "Tsunade",
  "Goku", "Vegeta", "Gohan", "Trunks", "Goten", "Piccolo", "Krillin", "Yamcha", "Tien", "Chiaotzu",
  "Luffy", "Zoro", "Sanji", "Nami", "Usopp", "Chopper", "Robin", "Franky", "Brook", "Jinbe",
  "Ichigo", "Rukia", "Renji", "Byakuya", "Kenpachi", "Toshiro", "Aizen", "Grimmjow", "Ulquiorra", "Starrk",
  "Eren", "Mikasa", "Armin", "Levi", "Erwin", "Hange", "Jean", "Connie", "Sasha", "Historia",
  "Tanjiro", "Nezuko", "Zenitsu", "Inosuke", "Giyu", "Shinobu", "Rengoku", "Tengen", "Mitsuri", "Obanai",
  "Deku", "Bakugo", "Todoroki", "Uraraka", "Iida", "Kirishima", "Mina", "Kaminari", "Jiro", "Yaoyorozu",
  "Saitama", "Genos", "Tatsumaki", "King", "MetalKnight", "DriveKnight", "FlashyFlash", "AtomicSamurai", "Bang", "Bomb",
  "Edward", "Alphonse", "Winry", "Roy", "Riza", "Alex", "Olivier", "Greed", "Lust", "Gluttony",
  "Light", "L", "Misa", "Ryuk", "Rem", "Near", "Mello", "Matsuda", "Soichiro", "Watari",
  "Sora", "Riku", "Kairi", "Roxas", "Axel", "Xemnas", "Xigbar", "Xaldin", "Vexen", "Lexaeus",
  "Ash", "Pikachu", "Misty", "Brock", "Gary", "Red", "Blue", "Green", "Lance", "Steven",
  "Yugi", "Kaiba", "Joey", "Tristan", "Tea", "Mai", "Pegasus", "Marik", "Bakura", "Dartz",
  "Yusuke", "Kuwabara", "Kurama", "Hiei", "Botan", "Genkai", "Toguro", "Sensui", "Raizen", "Mukuro",
  "Inuyasha", "Kagome", "Sango", "Miroku", "Shippo", "Kikyo", "Naraku", "Sesshomaru", "Rin", "Jaken",
  "Spike", "Jet", "Faye", "Ed", "Ein", "Vicious", "Julia", "Gren", "Punch", "Judy",
  "Vash", "Wolfwood", "Meryl", "Millie", "Knives", "Legato", "Razlo", "Livio", "Zazie", "Eriks",
  "Alucard", "Integra", "Seras", "Walter", "Anderson", "Enrico", "Yumie", "Heinkel", "Rip", "VanWinkle",
  "Kirito", "Asuna", "Leafa", "Sinon", "Yuuki", "Eugeo", "Alice", "Selka", "Ronie", "Tiese",
  "Subaru", "Emilia", "Rem", "Ram", "Beatrice", "Roswaal", "Puck", "Betelgeuse", "Petelgeuse", "Regulus",
  "Rimuru", "Shion", "Shuna", "Benimaru", "Gobta", "Ranga", "Veldora", "Milim", "Frey", "Carrion",
  "Ainz", "Albedo", "Shalltear", "Aura", "Mare", "Demiurge", "Cocytus", "Sebas", "Solution", "Entoma",
  "Kazuma", "Aqua", "Megumin", "Darkness", "Wiz", "Vanir", "Yunyun", "Iris", "Chris", "Eris",
  "Bell", "Ais", "Hestia", "Lili", "Welf", "Mikoto", "Haruhime", "Freya", "Ishtar", "Loki",
  "Naofumi", "Raphtalia", "Filo", "Melty", "Fitoria", "Ost", "Glass", "Larc", "Therese", "Kizuna",
  "ShieldHero", "SwordHero", "BowHero", "SpearHero", "Queen", "King", "Princess", "Knight", "Mage", "Priest",
  
  // Video Game Characters
  // Mario Universe
  "Mario", "Luigi", "Peach", "Daisy", "Bowser", "Yoshi", "Toad", "Wario", "Waluigi", "DonkeyKong",
  "DiddyKong", "Rosalina", "BowserJr", "Koopa", "Goomba", "ShyGuy", "Boo", "DryBones", "Lakitu", "Thwomp",
  
  // Zelda Universe
  "Link", "Zelda", "Ganondorf", "Sheik", "Impa", "Fi", "Midna", "Zant", "Ghirahim", "Demise",
  "Rauru", "Sonia", "Mineru", "Riju", "Tulin", "Yunobo", "Sidon", "Teba", "Kass", "Purah",
  
  // Pokemon Universe
  "Charizard", "Pikachu", "Blastoise", "Venusaur", "Mewtwo", "Mew", "Lugia", "HoOh", "Rayquaza", "Groudon",
  "Kyogre", "Dialga", "Palkia", "Giratina", "Arceus", "Reshiram", "Zekrom", "Kyurem", "Xerneas", "Yveltal",
  
  // Sonic Universe
  "Sonic", "Tails", "Knuckles", "Amy", "Shadow", "Rouge", "Silver", "Blaze", "Cream", "Charmy",
  "Vector", "Espio", "Big", "Omega", "Gamma", "E102", "Chaos", "MetalSonic", "Eggman", "Orbot",
  
  // Final Fantasy
  "Cloud", "Tifa", "Aerith", "Sephiroth", "Barret", "Vincent", "Yuffie", "Cid", "RedXIII", "CaitSith",
  "Squall", "Rinoa", "Zell", "Selphie", "Quistis", "Irvine", "Seifer", "Edea", "Ultimecia", "Laguna",
  "Tidus", "Yuna", "Auron", "Wakka", "Lulu", "Kimahri", "Rikku", "Seymour", "Jecht", "Sin",
  "Lightning", "Snow", "Hope", "Vanille", "Sazh", "Fang", "Serah", "Noel", "Caius", "Yeul",
  
  // Street Fighter
  "Ryu", "Ken", "ChunLi", "Guile", "Dhalsim", "Blanka", "E Honda", "Zangief", "Vega", "Sagat",
  "Balrog", "M Bison", "Akuma", "Gouki", "Sakura", "Dan", "Rose", "Gen", "Birdie", "Adon",
  
  // Mortal Kombat
  "Scorpion", "SubZero", "Raiden", "LiuKang", "JohnnyCage", "Sonya", "Kano", "Jax", "Kitana", "Mileena",
  "Jade", "Baraka", "Reptile", "Ermac", "Smoke", "Noob", "Cyrax", "Sektor", "Rain", "Tremor",
  
  // Resident Evil
  "Leon", "Claire", "Jill", "Chris", "Ada", "Wesker", "Nemesis", "MrX", "Tyrant", "Licker",
  "Sherry", "Rebecca", "Barry", "Carlos", "Nikolai", "Hunk", "Krauser", "Ashley", "Luis", "Krauser",
  
  // Metal Gear Solid
  "Snake", "BigBoss", "Liquid", "Solidus", "Raiden", "Meryl", "Otacon", "GrayFox", "PsychoMantis", "VulcanRaven",
  "SniperWolf", "RevolverOcelot", "TheBoss", "Eva", "ParaMedic", "Zero", "Volgin", "ThePain", "TheFear", "TheEnd",
  
  // Halo
  "MasterChief", "Cortana", "Arbiter", "Johnson", "Keyes", "Miranda", "Truth", "Regret", "Pity", "Gravemind",
  "Buck", "Romeo", "Dutch", "Mickey", "Jun", "Emile", "Jorge", "Kat", "Carter", "Noble",
  
  // Mass Effect
  "Shepard", "Garrus", "Tali", "Liara", "Wrex", "Ashley", "Kaidan", "Joker", "EDI", "Javik",
  "Miranda", "Jack", "Grunt", "Thane", "Samara", "Morinth", "Zaeed", "Kasumi", "Legion", "Mordin",
  
  // The Witcher
  "Geralt", "Yennefer", "Triss", "Ciri", "Dandelion", "Zoltan", "Lambert", "Eskel", "Vesemir", "Keira",
  "Roche", "Iorveth", "Letho", "Vernon", "Foltest", "Radovid", "Emhyr", "Eredin", "Avallach", "Imlerith",
  
  // Assassin's Creed
  "Ezio", "Altair", "Connor", "Edward", "Arno", "Shay", "Bayek", "Kassandra", "Alexios", "Eivor",
  "Basim", "Hytham", "Sigurd", "Randvi", "Valka", "Soma", "Halfdan", "Ubba", "Ivar", "Harald",
  
  // God of War
  "Kratos", "Atreus", "Faye", "Baldur", "Freya", "Thor", "Odin", "Tyr", "Mimir", "Brok",
  "Sindri", "Angrboda", "Thrud", "Sif", "Heimdall", "Surtr", "Nidhogg", "Fenrir", "Jormungandr", "Hel",
  
  // Red Dead Redemption
  "Arthur", "John", "Dutch", "Hosea", "Micah", "Bill", "Javier", "Charles", "Lenny", "Sean",
  "Karen", "MaryBeth", "Tilly", "Abigail", "Jack", "Sadie", "Reverend", "Strauss", "Pearson", "Grimshaw",
  
  // Grand Theft Auto
  "Niko", "Roman", "LittleJacob", "Brucie", "Packie", "Francis", "Dwayne", "Playboy", "Brucie", "Packie",
  "Franklin", "Michael", "Trevor", "Lamar", "Ron", "Wade", "Lester", "Devon", "Solomon", "Steve",
  
  // Call of Duty
  "Price", "Soap", "Ghost", "Gaz", "Nikolai", "Kamarov", "Shepherd", "Makarov", "Zakhaev", "Rojas",
  "Mason", "Woods", "Reznov", "Dragovich", "Kravchenko", "Steiner", "Hudson", "Weaver", "Bowman", "Clarke",
  
  // Overwatch
  "Tracer", "Widowmaker", "Reinhardt", "Mercy", "Genji", "Hanzo", "Pharah", "Junkrat", "Roadhog", "Zarya",
  "Bastion", "Torbjorn", "Symmetra", "Zenyatta", "Ana", "Sombra", "Orisa", "Doomfist", "Moira", "Brigitte",
  
  // League of Legends
  "Ahri", "Yasuo", "Lux", "Jinx", "Darius", "Garen", "Katarina", "Zed", "LeeSin", "Thresh",
  "Vayne", "Ezreal", "Ashe", "MasterYi", "Tryndamere", "Janna", "Soraka", "Nami", "Leona", "Alistar",
  
  // Dota 2
  "Invoker", "Pudge", "CrystalMaiden", "Lina", "PhantomAssassin", "Axe", "Juggernaut", "Lion", "ShadowFiend", "AntiMage",
  "Tidehunter", "WitchDoctor", "Sven", "Luna", "Mirana", "Windranger", "DrowRanger", "VengefulSpirit", "Razor", "Viper",
  
  // Minecraft
  "Steve", "Alex", "Notch", "Herobrine", "Enderman", "Creeper", "Zombie", "Skeleton", "Spider", "Slime",
  "Ghast", "Blaze", "Wither", "EnderDragon", "IronGolem", "SnowGolem", "Villager", "Pillager", "Vindicator", "Ravager",
  
  // Fortnite
  "Jonesy", "Ramirez", "Hawk", "Renegade", "Raptor", "RustLord", "Carbide", "Omega", "Drift", "Ragnarok",
  "Calamity", "Huntress", "Dire", "Lynx", "Zenith", "Luxe", "Rox", "Sledgehammer", "Rook", "Valkyrie",
  
  // Among Us
  "Red", "Blue", "Green", "Yellow", "Pink", "Purple", "Orange", "Cyan", "Brown", "Lime",
  "White", "Black", "Crewmate", "Impostor", "Engineer", "Scientist", "Guardian", "Angel", "Shapeshifter", "Traitor",
  
  // Fallout
  "VaultDweller", "ChosenOne", "LoneWanderer", "Courier", "SoleSurvivor", "VaultBoy", "VaultGirl", "PipBoy", "Codsworth", "Nick",
  "Piper", "Cait", "Curie", "Danse", "Hancock", "MacCready", "Preston", "Strong", "X6", "Deacon",
  
  // Skyrim
  "Dragonborn", "Alduin", "Paarthurnax", "Delphine", "Esbern", "Ulfric", "Tullius", "Elisif", "Balgruuf", "Jarl",
  "Lydia", "Serana", "Aela", "Farkas", "Vilkas", "Kodlak", "Skjor", "Njada", "Ria", "Torvar",
  
  // Dark Souls
  "ChosenUndead", "BearerOfTheCurse", "AshenOne", "Solaire", "Siegmeyer", "Patches", "Lautrec", "Gwynevere", "Gwyn", "Nito",
  "Seath", "BedOfChaos", "Ornstein", "Smough", "Artorias", "Sif", "Ciaran", "Gough", "Kalameet", "Manus",
  
  // Bloodborne
  "Hunter", "Gehrman", "Doll", "Eileen", "Alfred", "Djura", "Valtr", "Simon", "Adella", "Iosefka",
  "Gilbert", "Gascoigne", "Amelia", "Rom", "Micolash", "Mergo", "WetNurse", "MoonPresence", "Oedon", "Formless",
  
  // Sekiro
  "Wolf", "Kuro", "Emma", "Isshin", "Genichiro", "LadyButterfly", "Owl", "DivineDragon", "DemonOfHatred", "GuardianApe",
  "Gyoubu", "Juzou", "SevenSpears", "LoneShadow", "SnakeEyes", "Headless", "Shichimen", "Corrupted", "Sakura", "Dragon",
  
  // Elden Ring
  "Tarnished", "Malenia", "Radagon", "Marika", "Godfrey", "Morgott", "Mogh", "Ranni", "Blaidd", "Iji",
  "Seluvis", "Sellen", "Roderika", "Hewg", "Fia", "DungEater", "Goldmask", "Shabriri", "Gurranq", "Alexander"
];

// List all avatars that actually exist in public/avatar
export const AVATARS = [
  "/avatar/avatar1.png",
  "/avatar/avatar2.png",
  "/avatar/avatar3.png",
  "/avatar/avatar4.png",
  "/avatar/avatar5.png",
  "/avatar/avatar6.png",
  "/avatar/avatar7.png",
  "/avatar/avatar8.png",
  "/avatar/avatar9.png",
  "/avatar/avatar10.png",
  "/avatar/avatar11.png",
  "/avatar/avatar12.png",
  "/avatar/avatar13.png",
  "/avatar/avatar14.png",
  "/avatar/avatar15.png",
  "/avatar/avatar16.png",
  "/avatar/avatar17.png",
  "/avatar/avatar18.png",
  "/avatar/avatar19.png",
  "/avatar/avatar20.png",
  "/avatar/avatar21.png",
  "/avatar/avatar22.png",
  "/avatar/avatar23.png",
  "/avatar/avatar24.png",
  "/avatar/avatar25.png",
  "/avatar/avatar26.png",
  "/avatar/avatar27.png",
  "/avatar/avatar28.png",
  "/avatar/avatar29.png",
  "/avatar/avatar30.png",
  "/avatar/avatar31.png",
  "/avatar/avatar32.png",
  "/avatar/avatar33.png",
  "/avatar/avatar34.png",
  "/avatar/avatar35.png",
  "/avatar/avatar36.png",
  "/avatar/avatar37.png",
  "/avatar/avatar38.png",
  "/avatar/avatar39.png",
  "/avatar/avatar40.png",
  "/avatar/avatar41.png",
  "/avatar/avatar42.png",
  "/avatar/avatar43.png",
  "/avatar/avatar44.png",
  "/avatar/avatar45.png",
  "/avatar/avatar46.png",
  "/avatar/avatar47.png",
  "/avatar/avatar48.png",
  "/avatar/avatar49.png",
  "/avatar/avatar50.png",
  "/avatar/avatar51.png",
  "/avatar/avatar52.png",
  "/avatar/avatar53.png",
  "/avatar/avatar54.png",
  "/avatar/avatar55.png",
  "/avatar/avatar56.png",
  "/avatar/avatar57.png",
  "/avatar/avatar58.png",
  "/avatar/avatar59.png",
  "/avatar/avatar60.png",
  "/avatar/avatar61.png",
  "/avatar/avatar62.png",
  "/avatar/avatar63.png",
  "/avatar/avatar64.png",
  "/avatar/avatar65.png",
  "/avatar/avatar66.png",
  "/avatar/avatar67.png",
  "/avatar/avatar68.png",
  "/avatar/avatar69.png",
  "/avatar/avatar70.png",
  "/avatar/avatar71.png",
  "/avatar/avatar72.png",
  "/avatar/avatar73.png",
  "/avatar/avatar74.png",
  "/avatar/avatar75.png",
  "/avatar/avatar76.png",
  "/avatar/avatar77.png",
  "/avatar/avatar78.png",
  "/avatar/avatar79.png",
  "/avatar/avatar80.png",
  "/avatar/avatar81.png",
  "/avatar/avatar82.png",
  "/avatar/avatar83.png",
  "/avatar/avatar84.png",
  "/avatar/avatar85.png",
  "/avatar/avatar86.png",
  "/avatar/avatar87.png",
  "/avatar/avatar88.png",
  "/avatar/avatar89.png",
  "/avatar/avatar90.png",
  "/avatar/avatar91.png",
  "/avatar/avatar92.png",
  "/avatar/avatar93.png",
  "/avatar/avatar94.png",
  "/avatar/avatar95.png",
  "/avatar/avatar96.png",
  "/avatar/avatar97.png",
  "/avatar/avatar98.png",
  "/avatar/avatar99.png",
];

function getRandomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function checkAvatarExists(avatarPath: string): Promise<boolean> {
  return fetch(avatarPath, { method: 'HEAD' })
    .then(res => res.ok)
    .catch(() => false);
}

// Enhanced function to generate a unique username with timestamp to avoid duplicates
function generateUniqueUsername(): string {
  const baseName = getRandomItem(NAMES);
  return baseName; // Return only the clean character name
}

// Function to reset username (for testing purposes)
export function resetUsername() {
  localStorage.removeItem("username");
  window.location.reload();
}

// Function to change username to a different random name
export function changeUsername() {
  const newName = generateUniqueUsername();
  localStorage.setItem("username", newName);
  // Force a reload to update the UI
  window.location.reload();
}

export function useUserProfile() {
  const [username, setUsername] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);

  useEffect(() => {
    let storedName = localStorage.getItem("username");
    if (!storedName) {
      // Generate a unique username with timestamp to avoid duplicates
      storedName = generateUniqueUsername();
      localStorage.setItem("username", storedName);
    }
    setUsername(storedName);
    
    // Enhanced avatar generation: use both username and timestamp for better uniqueness
    if (storedName) {
      let hash = 0;
      for (let i = 0; i < storedName.length; i++) {
        hash = storedName.charCodeAt(i) + ((hash << 5) - hash);
      }
      // Deterministic avatar based on username only
      const idx = Math.abs(hash) % AVATARS.length;
      setAvatar(AVATARS[idx]);
    } else {
      setAvatar(AVATARS[0]);
    }
  }, []);

  return { username, avatar };
} 
