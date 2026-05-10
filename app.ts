import Homey from "homey";

class Omnik extends Homey.App {
  async onInit(): Promise<void> {
    this.log("Omnik app has been initialized");
  }
}

module.exports = Omnik;
