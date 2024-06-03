import React, { useState, useEffect } from "react";
import { Alert } from "react-native";
import jwtDecode from "jwt-decode";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function Token() {
  const [userData, setUserData] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      const data = await displayUserData();
      if (data) {
        setUserData(data);
        console.log("User data after JWT decoding:", data);
      } else {
        console.log("No user data available");
        Alert.alert("Login Failed", "No user data available");
      }
    };
    fetchData();
  }, []);

  const displayUserData = async () => {
    try {
      const token = await AsyncStorage.getItem("userToken");
      if (token) {
        const decoded = jwtDecode(token);
        console.log("Decoded JWT:", decoded);
        return decoded;
      } else {
        console.log("No token found");
        Alert.alert("Login Failed", "Token not found");
      }
    } catch (error) {
      console.error("Error retrieving or decoding token:", error);
      Alert.alert("Login Failed", error.message);
    }
    return null;
  };

  const token = async () => {
    try {
      const data = await fetchDataFromBackend(); // Replace fetchDataFromBackend with your actual function
      console.log("Data fetched from backend:", data);
      return data;
    } catch (error) {
      console.error("Error fetching data from backend:", error);
      return null;
    }
  };

  // Return JSX here if you want this component to render something
  return null;
}
